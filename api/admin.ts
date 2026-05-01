// api/admin.ts — Single router for all admin + tracking actions
// Replaces: stats, pending, track-order, approve, edit-pending, reset-slot,
//           broadcast, message-ambassador, test-email, check-env,
//           applications, approve-application, reject-application, get-next-slot
//
// Usage: POST/GET /api/admin?action=ACTION_NAME
// All POST bodies include { adminSecret, ...payload }

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

// ── Constants ─────────────────────────────────────────────────────────────────
const ADMIN_EMAIL = "EduCraft611@gmail.com";
const BASE_URL    = "https://edu-craft-ambassador.vercel.app";

// ── Vercel config — ensure req.body is always parsed ─────────────────────────
export const config = { api: { bodyParser: true } };


// ── Helpers ───────────────────────────────────────────────────────────────────
type RC = ReturnType<typeof createClient>;

async function redisClient(): Promise<RC> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is not set.");
  const c = createClient({ url });
  c.on("error", () => {});
  await c.connect();
  return c;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return false;
  try {
    const t = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: ADMIN_EMAIL, pass },
      socketTimeout: 15000, connectionTimeout: 10000,
    });
    await t.sendMail({ from: `"EduCraft" <${ADMIN_EMAIL}>`, to, subject, html });
    return true;
  } catch (e) { console.error("Email error:", e); return false; }
}

function authCheck(body: Record<string, string>, res: VercelResponse): boolean {
  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && (body.adminSecret ?? "") !== expected) {
    res.status(401).json({ error: "Invalid admin secret." });
    return false;
  }
  return true;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const action = (req.query.action as string | undefined) ?? "";
  const body   = (req.body ?? {}) as Record<string, string>;
  const secret = (req.query.secret as string | undefined) ?? body.adminSecret ?? "";

  // Public actions — no auth required
  const PUBLIC_ACTIONS = ["get-next-slot"];
  if (!PUBLIC_ACTIONS.includes(action)) {
    const expected = (process.env.ADMIN_SECRET ?? "").trim();
    // Fail-closed: if ADMIN_SECRET is not configured, block ALL protected actions.
    if (!expected) {
      res.status(500).json({ error: "ADMIN_SECRET is not configured on this server." });
      return;
    }
    if (secret.trim() !== expected) {
      res.status(401).json({ error: "Unauthorized. Check your Admin Secret." });
      return;
    }
  }

  if (!process.env.REDIS_URL && action !== "test-email" && action !== "check-env") {
    res.status(503).json({ error: "Tracking not configured. Add REDIS_URL to Vercel." });
    return;
  }

  try {
    switch (action) {

      // ── STATS ───────────────────────────────────────────────────────────────
      case "stats": {
        const client = await redisClient();
        const ids = await client.sMembers("ambassador_ids");
        if (ids.length === 0) { await client.disconnect(); res.status(200).json({}); return; }
        const rows = await Promise.all(ids.map(async id => {
          const [clicks, orders, profileStr] = await Promise.all([
            client.get(`clicks:${id}`), client.get(`orders:${id}`), client.get(`profile:${id}`),
          ]);
          let email: string|null = null, registeredName: string|null = null;
          if (profileStr) { try { const p = JSON.parse(profileStr); email = p.email??null; registeredName = p.name??null; } catch {} }
          return { id, clicks: parseInt(clicks??"0")||0, orders: parseInt(orders??"0")||0, email, registeredName };
        }));
        await client.disconnect();
        const stats: Record<string, { clicks:number;orders:number;email:string|null;registeredName:string|null }> = {};
        rows.forEach(r => { stats[r.id] = { clicks:r.clicks, orders:r.orders, email:r.email, registeredName:r.registeredName }; });
        res.status(200).json(stats);
        break;
      }

      // ── PENDING ─────────────────────────────────────────────────────────────
      case "pending": {
        const client = await redisClient();
        const ids = await client.sMembers("pending_ids");
        if (ids.length === 0) { await client.disconnect(); res.status(200).json([]); return; }
        const strs = await Promise.all(ids.map(id => client.get(`pending:${id}`)));
        await client.disconnect();
        const profiles = strs.filter(Boolean).map(s => { try { return JSON.parse(s!); } catch { return null; } }).filter(Boolean)
          .sort((a: {registeredAt:string}, b: {registeredAt:string}) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime());
        res.status(200).json(profiles);
        break;
      }

      // ── TRACK ORDER ─────────────────────────────────────────────────────────
      case "track-order": {
        const { slotId="", jobDesc="", jobAmount="", commissionPercent="10" } = body;
        if (!slotId.trim()) { res.status(400).json({ error: "slotId is required." }); return; }
        const id = slotId.trim().toUpperCase();
        const record = JSON.stringify({ timestamp: new Date().toISOString(), jobDesc: jobDesc.trim(), jobAmount, commissionPercent });
        const client = await redisClient();
        await client.multi().incr(`orders:${id}`).lPush(`orders:${id}:log`, record).sAdd("ambassador_ids", id).exec();
        const profileStr = await client.get(`profile:${id}`);
        await client.disconnect();
        let emailSent = false, emailTo = "", emailReason = "no_profile";
        if (profileStr) {
          const profile = JSON.parse(profileStr) as { name: string; email: string };
          emailTo = profile.email ?? "";
          if (!emailTo) { emailReason = "no_email"; }
          else if (!process.env.GMAIL_APP_PASSWORD) { emailReason = "no_gmail_password"; }
          else {
            const amount = parseFloat(jobAmount.replace(/,/g,""))||0;
            const pct = parseFloat(commissionPercent)||10;
            const commission = amount > 0 ? amount*(pct/100) : 0;
            emailSent = await sendEmail(emailTo, "EduCraft — Commission Notification", commissionHtml(profile.name, jobDesc.trim(), amount, pct, commission));
            emailReason = emailSent ? "sent" : "send_failed";
          }
        }
        res.status(200).json({ success:true, emailSent, emailTo, emailReason });
        break;
      }

      // ── APPROVE PENDING REGISTRATION ────────────────────────────────────────
      case "approve": {
        const { slotId="", action:_a="approve", reason="", baseUrl=BASE_URL } = body;
        const act = body.action ?? "approve";
        if (!slotId) { res.status(400).json({ error: "slotId required." }); return; }
        const id = slotId.trim().toUpperCase();
        const client = await redisClient();
        const profileStr = await client.get(`pending:${id}`);
        if (!profileStr) { await client.disconnect(); res.status(404).json({ error: "No pending registration found." }); return; }
        const profile = JSON.parse(profileStr) as { slotId:string;name:string;school:string;email:string;registeredAt:string };
        if (act === "approve") {
          await client.multi().set(`profile:${id}`, JSON.stringify(profile)).del(`pending:${id}`).sRem("pending_ids",id).sAdd("approved_ids",id).sAdd("ambassador_ids",id).exec();
          await client.disconnect();
          let link = `${baseUrl}/EduCraftA/${id}`;
          if (id.startsWith("ECCA-")) link = `${baseUrl}/ECCA/${id}`;
          if (id.startsWith("ECSA-")) link = `${baseUrl}/ECSA/${id}`;
          const emailSent = await sendEmail(profile.email, "EduCraft — Your Ambassador Account is Now Active", welcomeHtml(profile.name, id, link));
          res.status(200).json({ success:true, action:"approved", name:profile.name, email:profile.email, emailSent });
        } else {
          await client.multi().del(`pending:${id}`).sRem("pending_ids",id).exec();
          await client.disconnect();
          const emailSent = await sendEmail(profile.email, "EduCraft — Ambassador Registration Update", rejectionHtml(profile.name, id, reason));
          res.status(200).json({ success:true, action:"rejected", emailSent });
        }
        break;
      }

      // ── EDIT PENDING REGISTRATION ───────────────────────────────────────────
      case "edit-pending": {
        const { originalSlotId="", slotId="", name="", school="", email="", changeReason="" } = body;
        if (!originalSlotId || !slotId || !name || !email) { res.status(400).json({ error: "originalSlotId, slotId, name, email are required." }); return; }
        const origId = originalSlotId.trim().toUpperCase();
        const newId  = slotId.trim().toUpperCase();
        const client = await redisClient();
        const existing = await client.get(`pending:${origId}`);
        if (!existing) { await client.disconnect(); res.status(404).json({ error: "No pending registration found." }); return; }
        const oldProfile = JSON.parse(existing) as Record<string, string>;
        const updated = { ...oldProfile, slotId:newId, name:name.trim(), school:school.trim(), email:email.trim().toLowerCase(), adminCorrected:true, changeReason:changeReason||"Corrected by admin.", correctedAt:new Date().toISOString() };
        if (origId !== newId) {
          const [np, na] = await Promise.all([client.sIsMember("pending_ids",newId), client.sIsMember("approved_ids",newId)]);
          if (np||na) { await client.disconnect(); res.status(409).json({ error: `Slot ${newId} is already in use.` }); return; }
          await client.multi().del(`pending:${origId}`).sRem("pending_ids",origId).set(`pending:${newId}`,JSON.stringify(updated)).sAdd("pending_ids",newId).exec();
        } else {
          await client.set(`pending:${origId}`, JSON.stringify(updated));
        }
        await client.disconnect();
        res.status(200).json({ success:true, updatedProfile:updated });
        break;
      }

      // ── RESET SLOT ──────────────────────────────────────────────────────────
      case "reset-slot": {
        const { slotId="" } = body;
        if (!slotId.trim()) { res.status(400).json({ error: "slotId is required." }); return; }
        const id = slotId.trim().padStart(3,"0").toUpperCase();
        const client = await redisClient();
        // Fetch application and profile before deleting so we can remove uniqueness indexes
        const [appStr, profileStr, pendingStr] = await Promise.all([
          client.get(`application:${id}`),
          client.get(`profile:${id}`),
          client.get(`pending:${id}`),
        ]);
        const tx = client.multi()
          .del(`profile:${id}`)
          .del(`pending:${id}`)
          .del(`clicks:${id}`)
          .del(`orders:${id}`)
          .del(`orders:${id}:log`)
          .del(`payment:${id}`)
          .del(`application:${id}`)
          .sRem("approved_ids", id)
          .sRem("pending_ids", id)
          .sRem("ambassador_ids", id)
          .sRem("application_ids", id)
          .sRem("approved_application_ids", id)
          .sRem("payment_ids", id);
        // Clear all duplicate-detection indexes from the application
        if (appStr) {
          try {
            const app = JSON.parse(appStr) as Record<string,string>;
            const normEmail = app.email ?? "";
            const normPhone = (app.phone ?? "").replace(/\D/g,"");
            const normBank  = (app.accountNumber ?? "").replace(/\D/g,"");
            const normName  = (app.fullName ?? "").trim().toLowerCase().replace(/\s+/g," ");
            tx.sRem("app_emails", normEmail)
              .sRem("app_phones", normPhone)
              .sRem("app_banks",  normBank)
              .del(`app_name:${normName}`);
          } catch {}
        }
        // Also clear from pending if it exists
        if (pendingStr) {
          try {
            const p = JSON.parse(pendingStr) as Record<string,string>;
            const normEmail = (p.email ?? "").trim().toLowerCase();
            tx.sRem("app_emails", normEmail);
          } catch {}
        }
        await tx.exec();
        await client.disconnect();
        res.status(200).json({ success:true, message:`Slot ${id} fully reset. All data and duplicate locks cleared.` });
        break;
      }

      // ── BROADCAST ───────────────────────────────────────────────────────────
      case "broadcast": {
        const { subject="", message="" } = body;
        if (!subject.trim()) { res.status(400).json({ error: "Subject is required." }); return; }
        if (!message.trim()) { res.status(400).json({ error: "Message is required." }); return; }
        if (!process.env.GMAIL_APP_PASSWORD) { res.status(503).json({ error: "Gmail not configured." }); return; }
        const client = await redisClient();
        const approvedIds = await client.sMembers("approved_ids");
        if (approvedIds.length === 0) { await client.disconnect(); res.status(200).json({ success:true, sent:0, failed:0 }); return; }
        const profileStrs = await Promise.all(approvedIds.map(id => client.get(`profile:${id}`)));
        await client.disconnect();
        const emails = profileStrs.filter(Boolean).map(s => { try { return JSON.parse(s!).email; } catch { return null; } }).filter((e): e is string => !!e && e.includes("@"));
        let sent = 0, failed = 0;
        const body2 = message.replace(/\n/g, "<br/>");
        for (const email of emails) {
          const ok = await sendEmail(email, subject.trim(), broadcastHtml(subject.trim(), body2));
          ok ? sent++ : failed++;
        }
        res.status(200).json({ success:true, sent, failed, total:emails.length });
        break;
      }

      // ── MESSAGE AMBASSADOR ──────────────────────────────────────────────────
      case "message-ambassador": {
        const { slotId="", title="", message="" } = body;
        if (!slotId||!title||!message) { res.status(400).json({ error: "slotId, title, and message are required." }); return; }
        if (!process.env.GMAIL_APP_PASSWORD) { res.status(503).json({ error: "Gmail not configured." }); return; }
        const id = slotId.trim().toUpperCase();
        const client = await redisClient();
        const profileStr = await client.get(`profile:${id}`);
        await client.disconnect();
        if (!profileStr) { res.status(404).json({ error: "This ambassador has not registered their email yet." }); return; }
        const profile = JSON.parse(profileStr) as { name:string; email:string };
        if (!profile.email) { res.status(404).json({ error: "No email found for this ambassador." }); return; }
        const ok = await sendEmail(profile.email, title.trim(), messageHtml(profile.name, title.trim(), message.trim()));
        res.status(200).json({ success:ok, sentTo:profile.email, name:profile.name });
        break;
      }

      // ── TEST EMAIL ──────────────────────────────────────────────────────────
      case "test-email": {
        if (!process.env.GMAIL_APP_PASSWORD) {
          res.status(503).json({ error:"GMAIL_APP_PASSWORD is not set in this environment.", env:process.env.VERCEL_ENV??"unknown" });
          return;
        }
        const ok = await sendEmail(ADMIN_EMAIL, "EduCraft — Email Test Successful",
          `<div style="font-family:sans-serif;padding:24px"><h2 style="color:#0D5753">Email is working</h2><p>Environment: <strong>${process.env.VERCEL_ENV??"unknown"}</strong></p></div>`);
        res.status(ok?200:500).json({ success:ok, env:process.env.VERCEL_ENV??"unknown", message: ok?"Test email sent.":"Send failed — check Gmail App Password." });
        break;
      }

      // ── CHECK ENV ──────────────────────────────────────────────────────────
      // Used as the login password-verification endpoint by App.tsx.
      // Auth is already verified by the top-level guard above — if we reach
      // this point the password is correct, so just return { ok: true }.
      case "check-env": {
        res.status(200).json({
          ok:                 true,
          REDIS_URL:          process.env.REDIS_URL          ? "SET" : "MISSING",
          GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD ? "SET" : "MISSING",
          ADMIN_SECRET:       "SET",
          VERCEL_ENV:         process.env.VERCEL_ENV          ?? "unknown",
        });
        break;
      }

      // ── APPLICATIONS (list) ─────────────────────────────────────────────────
      case "applications": {
        const client = await redisClient();
        const ids = await client.sMembers("application_ids");
        if (ids.length === 0) { await client.disconnect(); res.status(200).json([]); return; }
        const strs = await Promise.all(ids.map(id => client.get(`application:${id}`)));
        await client.disconnect();
        const apps = strs.filter(Boolean).map(s => { try { return JSON.parse(s!); } catch { return null; } }).filter(Boolean)
          .sort((a: {submittedAt:string}, b: {submittedAt:string}) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());
        res.status(200).json(apps);
        break;
      }

      // ── APPROVE APPLICATION ─────────────────────────────────────────────────
      case "approve-application": {
        const { slotId="", baseUrl=BASE_URL, fullName="", universityAbbr="", email="" } = body;
        if (!slotId) { res.status(400).json({ error: "slotId required." }); return; }
        const id = slotId.trim().padStart(3,"0");
        const client = await redisClient();
        const appStr = await client.get(`application:${id}`);
        if (!appStr) { await client.disconnect(); res.status(404).json({ error: "Application not found." }); return; }
        const app = JSON.parse(appStr) as Record<string, string>;
        const finalName   = fullName.trim()       || app.fullName;
        const finalAbbr   = universityAbbr.trim() || app.universityAbbr;
        const finalEmail  = email.trim()          || app.email;
        const profile     = { slotId:id, name:finalName, school:finalAbbr, email:finalEmail, registeredAt:new Date().toISOString() };
        const paymentRecord = { slotId:id, name:finalName, bankName:app.bankName, accountNumber:app.accountNumber, accountName:app.accountName, email:finalEmail, phone:app.phone, universityFull:app.universityFull, universityAbbr:finalAbbr, approvedAt:new Date().toISOString() };
        const approvedApp = { ...app, status:"approved", approvedAt:new Date().toISOString(), finalName, finalEmail, finalAbbr };
        await client.multi()
          .set(`profile:${id}`, JSON.stringify(profile))
          .sAdd("approved_ids", id).sAdd("ambassador_ids", id)
          .set(`payment:${id}`, JSON.stringify(paymentRecord)).sAdd("payment_ids", id)
          .set(`application:${id}`, JSON.stringify(approvedApp))
          .sRem("application_ids", id).sAdd("approved_application_ids", id)
          .exec();
        await client.disconnect();
        const link = `${baseUrl}/EduCraftA/${id}`;
        const emailSent = await sendEmail(finalEmail, "Welcome to EduCraft — Your Ambassador Account is Active", welcomeAppHtml(finalName, id, link, finalAbbr));
        res.status(200).json({ success:true, slotId:id, name:finalName, email:finalEmail, link, emailSent });
        break;
      }

      // ── REJECT APPLICATION ──────────────────────────────────────────────────
      case "reject-application": {
        const { slotId="", reason="" } = body;
        if (!slotId) { res.status(400).json({ error: "slotId required." }); return; }
        const id = slotId.trim().padStart(3,"0");
        const client = await redisClient();
        const appStr = await client.get(`application:${id}`);
        if (!appStr) { await client.disconnect(); res.status(404).json({ error: "Application not found." }); return; }
        const app = JSON.parse(appStr) as Record<string, string>;
        const normName = app.fullName?.trim().toLowerCase().replace(/\s+/g," ")??"";
        await client.multi()
          .del(`application:${id}`).sRem("application_ids",id)
          .sRem("app_emails", app.email).sRem("app_phones", app.phone?.replace(/\D/g,"")??"")
          .sRem("app_banks", app.accountNumber?.replace(/\D/g,"")??"").del(`app_name:${normName}`)
          .exec();
        await client.disconnect();
        const rBlock = reason.trim() ? `<div style="background:#fafafa;border-left:4px solid #ccc;padding:12px 16px;margin:16px 0;color:#555;font-size:.88rem">${reason}</div>` : "";
        const emailSent = await sendEmail(app.email, "EduCraft Ambassador Application — Update",
          `<div style="font-family:sans-serif;padding:32px;max-width:480px"><h2 style="color:#0D5753">Application Update</h2><p>Dear <strong>${app.fullName}</strong>,</p><p>Thank you for applying. After review, we are unable to proceed at this time.</p>${rBlock}<p>Please contact your EduCraft coordinator if you have questions.</p><p style="font-size:.75rem;color:#888;margin-top:24px">EDUCRAFT — Academic & Technical Documentation Experts</p></div>`);
        res.status(200).json({ success:true, emailSent });
        break;
      }

      // ── GET NEXT SLOT ───────────────────────────────────────────────────────
      case "get-next-slot": {
        // existingSlots is passed from the frontend: [{id:"001",status:"active"|"vacant"}, ...]
        // Strategy:
        //   1. Find vacant slots not already taken by pending/approved/applications
        //   2. If none vacant, use next number after the highest existing slot
        const rawBody = (req.method === "POST") ? body : {};
        const existingSlots: { id: string; status: string }[] = Array.isArray(rawBody.existingSlots)
          ? rawBody.existingSlots
          : [];

        const client = await redisClient();
        const [approved, pending2, apps] = await Promise.all([
          client.sMembers("approved_ids"),
          client.sMembers("pending_ids"),
          client.sMembers("application_ids"),
        ]);
        await client.disconnect();

        // All IDs already taken in the tracking system
        const taken = new Set([...approved, ...pending2, ...apps].map(id => id.padStart(3, "0")));

        // Step 1: Find a vacant slot from the existing ambassador list that isn't taken
        const vacantSlots = existingSlots
          .filter(s => s.status === "vacant" && !taken.has(s.id.padStart(3, "0")))
          .sort((a, b) => parseInt(a.id) - parseInt(b.id));

        if (vacantSlots.length > 0) {
          const slotId = vacantSlots[0].id.padStart(3, "0");
          res.status(200).json({ slotId, nextNumber: parseInt(slotId, 10), fromVacant: true });
          break;
        }

        // Step 2: No vacant slots — find next number after the highest existing slot
        const allExistingNums = existingSlots.map(s => parseInt(s.id, 10)).filter(n => !isNaN(n) && n > 0);
        const takenNums = new Set([...taken].map(id => parseInt(id, 10)).filter(n => !isNaN(n)));

        let next = allExistingNums.length > 0 ? Math.max(...allExistingNums) + 1 : 1;
        // Skip any already taken
        while (takenNums.has(next)) next++;

        res.status(200).json({ slotId: String(next).padStart(3, "0"), nextNumber: next, fromVacant: false });
        break;
      }

      // ── SYNC DATA (for cross-device dashboard sync) ─────────────────────────
      // Returns all approved profiles so any device can build the full ambassador list
      case "sync-data": {
        const client = await redisClient();
        const approvedIds = await client.sMembers("approved_ids");
        if (approvedIds.length === 0) { await client.disconnect(); res.status(200).json({ profiles: {}, payments: {} }); return; }
        const [profileStrs, paymentStrs] = await Promise.all([
          Promise.all(approvedIds.map(id => client.get(`profile:${id}`).then(s => ({ id, s })))),
          Promise.all(approvedIds.map(id => client.get(`payment:${id}`).then(s => ({ id, s })))),
        ]);
        await client.disconnect();
        const profiles: Record<string, { name: string; school: string; email: string }> = {};
        profileStrs.forEach(({ id, s }) => {
          if (s) { try { profiles[id.padStart(3,"0")] = JSON.parse(s); } catch {} }
        });
        const payments: Record<string, Record<string, string>> = {};
        paymentStrs.forEach(({ id, s }) => {
          if (s) { try { payments[id.padStart(3,"0")] = JSON.parse(s); } catch {} }
        });
        res.status(200).json({ profiles, payments });
        break;
      }

      // ── CLEAR AMBASSADOR (when slot is made vacant) ──────────────────────────
      // Clears Redis profile + payment record but keeps click/order history
      case "clear-ambassador": {
        const { slotId="" } = body;
        if (!slotId.trim()) { res.status(400).json({ error: "slotId is required." }); return; }
        const id = slotId.trim().padStart(3,"0");
        const client = await redisClient();
        // Fetch application data before deleting to clear uniqueness indexes
        const appStr = await client.get(`application:${id}`);
        const tx = client.multi()
          .del(`profile:${id}`)
          .del(`payment:${id}`)
          .del(`application:${id}`)
          .sRem("approved_ids", id)
          .sRem("ambassador_ids", id)
          .sRem("payment_ids", id)
          .sRem("application_ids", id)
          .sRem("approved_application_ids", id);
        if (appStr) {
          try {
            const app = JSON.parse(appStr) as Record<string,string>;
            const normEmail = app.email ?? "";
            const normPhone = (app.phone ?? "").replace(/\D/g,"");
            const normBank  = (app.accountNumber ?? "").replace(/\D/g,"");
            const normName  = (app.fullName ?? "").trim().toLowerCase().replace(/\s+/g," ");
            tx.sRem("app_emails", normEmail)
              .sRem("app_phones", normPhone)
              .sRem("app_banks",  normBank)
              .del(`app_name:${normName}`);
          } catch {}
        }
        await tx.exec();
        await client.disconnect();
        res.status(200).json({ success: true, message: `Slot ${id} fully cleared. All details and duplicate locks removed.` });
        break;
      }

      // ── PAYMENT RECORDS ───────────────────────────────────────────────────────
      case "payment-records": {
        const client = await redisClient();
        const ids = await client.sMembers("payment_ids");
        if (ids.length === 0) { await client.disconnect(); res.status(200).json([]); return; }
        const strs = await Promise.all(ids.map(id => client.get(`payment:${id}`)));
        await client.disconnect();
        const records = strs.filter(Boolean).map(s => { try { return JSON.parse(s!); } catch { return null; } }).filter(Boolean)
          .sort((a: {slotId:string}, b: {slotId:string}) => parseInt(a.slotId) - parseInt(b.slotId));
        res.status(200).json(records);
        break;
      }

      // ── SAVE / UPDATE PAYMENT RECORD ────────────────────────────────────────
      case "save-payment": {
        const { slotId="", fullName="", bankName="", accountNumber="", accountName="",
                email="", phone="", universityFull="", universityAbbr="" } = body;
        if (!slotId.trim()) { res.status(400).json({ error: "slotId is required." }); return; }
        const id = slotId.trim().padStart(3, "0");
        const client = await redisClient();
        const existing = await client.get(`payment:${id}`);
        const prev = existing ? JSON.parse(existing) : {};
        const updated = {
          ...prev,
          slotId: id,
          ...(fullName.trim()       && { name:           fullName.trim() }),
          ...(bankName.trim()       && { bankName:        bankName.trim() }),
          ...(accountNumber.trim()  && { accountNumber:   accountNumber.trim() }),
          ...(accountName.trim()    && { accountName:     accountName.trim() }),
          ...(email.trim()          && { email:           email.trim() }),
          ...(phone.trim()          && { phone:           phone.trim() }),
          ...(universityFull.trim() && { universityFull:  universityFull.trim() }),
          ...(universityAbbr.trim() && { universityAbbr:  universityAbbr.trim() }),
          updatedAt: new Date().toISOString(),
        };
        await client.multi().set(`payment:${id}`, JSON.stringify(updated)).sAdd("payment_ids", id).exec();
        await client.disconnect();
        res.status(200).json({ success: true, record: updated });
        break;
      }

      // ── GET SINGLE PAYMENT RECORD ────────────────────────────────────────────
      case "get-payment": {
        const slotId = (body.slotId || (req.query.slotId as string) || "").trim().padStart(3, "0");
        if (!slotId || slotId === "000") { res.status(400).json({ error: "slotId required." }); return; }
        const client = await redisClient();
        const str = await client.get(`payment:${slotId}`);
        await client.disconnect();
        if (!str) { res.status(200).json(null); return; }
        res.status(200).json(JSON.parse(str));
        break;
      }

      default:
        res.status(400).json({ error: `Unknown action: "${action}". Valid actions: stats, pending, track-order, approve, edit-pending, reset-slot, broadcast, message-ambassador, test-email, check-env, applications, approve-application, reject-application, get-next-slot` });
    }
  } catch (err) {
    console.error(`Admin action "${action}" error:`, err);
    res.status(500).json({ error: `Action failed: ${String(err)}` });
  }
}

// ── Email templates ───────────────────────────────────────────────────────────
function commissionHtml(name:string,jobDesc:string,amount:number,pct:number,commission:number):string{
  const jb=jobDesc?`<div style="background:#FFF9ED;border-left:4px solid #fbdb21;padding:14px 18px;margin:18px 0;color:#333;font-size:.88rem;line-height:1.6"><strong>Job Details:</strong><br/>${jobDesc}</div>`:"";
  const cb=amount>0?`<div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #12827c;border-radius:2px;padding:18px 20px;margin:20px 0;text-align:center"><div style="font-size:.72rem;color:#12827c;font-weight:700;text-transform:uppercase;margin-bottom:8px">Your Commission</div><div style="font-size:1.8rem;font-weight:700;color:#0D5753">&#8358;${commission.toLocaleString("en-NG",{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div style="font-size:.82rem;color:#888;margin-top:4px">${pct}% of &#8358;${amount.toLocaleString("en-NG")}</div></div>`:`<div style="background:#f8f8f8;border-left:4px solid #12827c;padding:14px 18px;margin:20px 0;color:#0D5753;font-size:.88rem">Your commission will be confirmed by your EduCraft coordinator.</div>`;
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:32px 16px"><div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px"><div style="font-size:.75rem;font-weight:700;color:#12827c;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">EduCraft</div><h1 style="color:#0D5753;font-size:1.3rem;font-weight:700;margin:0 0 20px">Referral Commission — New Order Confirmed</h1><p style="color:#333;line-height:1.7">Dear <strong>${name}</strong>,</p><p style="color:#333;line-height:1.7">A client referred through your EduCraft ambassador link has placed a confirmed order.</p>${jb}${cb}<p style="color:#333;line-height:1.7">Keep sharing your referral link to grow your earnings.</p><div style="margin-top:28px;padding-top:18px;border-top:1px solid #e8e8e8;font-size:.75rem;color:#888">EDUCRAFT — Academic &amp; Technical Documentation Experts</div></div></div>`;
}
function welcomeHtml(name:string,slotId:string,link:string):string{
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:32px 16px"><div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px"><div style="font-size:.75rem;font-weight:700;color:#12827c;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">EduCraft</div><h1 style="color:#0D5753;font-size:1.35rem;font-weight:700;margin:0 0 20px">Ambassador Account Activated</h1><p style="color:#333;line-height:1.7">Dear <strong>${name}</strong>,</p><p style="color:#333;line-height:1.7">Your registration has been verified and approved. Your referral link is now live.</p><div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #12827c;border-radius:2px;padding:18px 20px;margin:20px 0"><div style="font-size:.72rem;color:#12827c;font-weight:700;text-transform:uppercase;margin-bottom:8px">Your Referral Link</div><div style="font-family:monospace;color:#0D5753;font-size:.88rem;word-break:break-all">${link}</div><div style="font-size:.75rem;color:#aaa;margin-top:4px">Slot ID: ${slotId}</div></div><p style="color:#333;line-height:1.7">Every confirmed order earns you a commission — you will be notified by email each time.</p><div style="margin-top:28px;padding-top:18px;border-top:1px solid #e8e8e8;font-size:.75rem;color:#888">EDUCRAFT — Academic &amp; Technical Documentation Experts</div></div></div>`;
}
function welcomeAppHtml(name:string,slotId:string,link:string,school:string):string{
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:32px 16px"><div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px"><div style="font-size:.75rem;font-weight:700;color:#12827c;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">EduCraft Ambassador Programme</div><h1 style="color:#0D5753;font-size:1.35rem;font-weight:700;margin:0 0 20px">Welcome aboard, ${name}!</h1><p style="color:#333;line-height:1.7">Your application has been approved. You are now an official EduCraft Ambassador at <strong>${school}</strong>.</p><div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #12827c;border-radius:2px;padding:18px 20px;margin:20px 0"><div style="font-size:.72rem;color:#12827c;font-weight:700;text-transform:uppercase;margin-bottom:8px">Your Referral Link</div><div style="font-family:monospace;color:#0D5753;font-size:.88rem;word-break:break-all">${link}</div><div style="font-size:.75rem;color:#aaa;margin-top:4px">Slot ID: EduCraftA-${slotId}</div></div><div style="background:#FFF9ED;border:1px solid #E0B846;border-radius:4px;padding:14px 18px;margin-bottom:20px;font-size:.87rem;color:#0D5753;line-height:1.8"><strong>How it works:</strong><br/>1. Share your link with potential clients<br/>2. When they message EduCraft, your name is included automatically<br/>3. When the order is confirmed, you earn 10% commission<br/>4. You will receive an email notification with your earnings</div><div style="margin-top:28px;padding-top:18px;border-top:1px solid #e8e8e8;font-size:.75rem;color:#888">EDUCRAFT — Academic &amp; Technical Documentation Experts</div></div></div>`;
}
function rejectionHtml(name:string,slotId:string,reason:string):string{
  const r=reason?`<div style="background:#fafafa;border-left:4px solid #ccc;padding:12px 16px;margin:16px 0;color:#555;font-size:.88rem">${reason}</div>`:"";
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:32px 16px"><div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px"><h2 style="color:#0D5753;margin:0 0 20px">Registration Update — Slot ${slotId}</h2><p style="color:#333;line-height:1.7">Dear <strong>${name}</strong>,</p><p style="color:#333;line-height:1.7">Thank you for applying. After reviewing your registration for slot <strong>${slotId}</strong>, we were unable to verify the details at this time.</p>${r}<p style="color:#333;line-height:1.7">If you believe this is an error, please contact us at help.educraft@gmail.com or resubmit.</p><div style="margin-top:28px;padding-top:18px;border-top:1px solid #e8e8e8;font-size:.75rem;color:#888">EDUCRAFT — Academic &amp; Technical Documentation Experts</div></div></div>`;
}
function broadcastHtml(subject:string,body:string):string{
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:32px 16px"><div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px"><div style="font-size:.75rem;font-weight:700;color:#12827c;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">EduCraft — Ambassador Update</div><h1 style="color:#0D5753;font-size:1.3rem;font-weight:700;margin:0 0 20px">${subject}</h1><div style="color:#333;line-height:1.8;font-size:.92rem">${body}</div><div style="margin-top:32px;padding-top:20px;border-top:1px solid #e8e8e8;font-size:.75rem;color:#888">EDUCRAFT — Academic &amp; Technical Documentation Experts. This message was sent to all active EduCraft Ambassadors.</div></div></div>`;
}
function messageHtml(name:string,title:string,message:string):string{
  const body=message.replace(/\n/g,"<br/>");
  return `<div style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;padding:32px 16px"><div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px"><div style="font-size:.75rem;font-weight:700;color:#12827c;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px">EduCraft — Message for You</div><h1 style="color:#0D5753;font-size:1.25rem;font-weight:700;margin:0 0 20px">${title}</h1><p style="color:#333;line-height:1.7">Dear <strong>${name}</strong>,</p><div style="color:#333;line-height:1.8;font-size:.92rem;margin-bottom:28px">${body}</div><div style="border-top:1px solid #e8e8e8;padding-top:20px;font-size:.75rem;color:#888">EDUCRAFT — Academic &amp; Technical Documentation Experts. This message was sent directly to you by the EduCraft admin team.</div></div></div>`;
}
