// api/apply.ts
// Public ambassador application endpoint.
// Stores full application data, performs duplicate detection, notifies admin.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

const ADMIN_EMAIL = "EduCraft611@gmail.com";

function normalize(s: string): string { return s.trim().toLowerCase().replace(/\s+/g, " "); }
function normalizeBank(n: string): string { return n.replace(/\D/g, ""); } // digits only

async function notifyAdmin(app: Record<string, string>): Promise<void> {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return;
  try {
    const t = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: ADMIN_EMAIL, pass },
      socketTimeout: 15000, connectionTimeout: 10000,
    });
    await t.sendMail({
      from: `"EduCraft System" <${ADMIN_EMAIL}>`,
      to:   ADMIN_EMAIL,
      subject: `[New Application] Ambassador Application — Slot ${app.slotId}`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:540px;margin:0 auto;background:#fff;border-top:4px solid #fbdb21;border-radius:4px;padding:40px 40px 32px">
  <div style="margin-bottom:24px">
    <div style="font-size:0.75rem;font-weight:700;color:#12827c;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">EduCraft — New Ambassador Application</div>
    <h1 style="color:#0D5753;font-size:1.2rem;font-weight:700;margin:0">Review Required — Slot ${app.slotId}</h1>
  </div>
  <div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #fbdb21;border-radius:2px;padding:18px 20px;margin-bottom:20px">
    <table style="width:100%;border-collapse:collapse;font-size:0.88rem">
      <tr style="border-bottom:1px solid #eee"><td style="padding:7px 0;color:#888;width:130px">Assigned Slot</td><td style="padding:7px 0;color:#0D5753;font-weight:700;font-family:monospace">${app.slotId}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:7px 0;color:#888">Full Name</td><td style="padding:7px 0;color:#0D5753;font-weight:600">${app.fullName}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:7px 0;color:#888">University</td><td style="padding:7px 0;color:#333">${app.universityFull} (${app.universityAbbr})</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:7px 0;color:#888">Email</td><td style="padding:7px 0;color:#12827c">${app.email}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:7px 0;color:#888">Phone</td><td style="padding:7px 0;color:#333">${app.phone}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:7px 0;color:#888">Bank</td><td style="padding:7px 0;color:#333">${app.bankName}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:7px 0;color:#888">Account No.</td><td style="padding:7px 0;color:#333;font-family:monospace">${app.accountNumber}</td></tr>
      <tr><td style="padding:7px 0;color:#888">Account Name</td><td style="padding:7px 0;color:#333">${app.accountName}</td></tr>
    </table>
  </div>
  <div style="background:#FFF9ED;border:1px solid #E0B846;border-radius:4px;padding:14px 18px;margin-bottom:24px;font-size:0.87rem;color:#0D5753;line-height:1.8">
    <strong>Action required:</strong> Log in to the EduCraft Ambassador Panel &rarr; <strong>Applications</strong> tab &rarr; Accept, Edit, or Reject this application.
  </div>
  <div style="border-top:1px solid #e8e8e8;padding-top:18px;font-size:0.75rem;color:#888">
    <strong style="color:#12827c">EDUCRAFT</strong> — Automated notification. Do not reply.
  </div>
</div></body></html>`,
    });
  } catch (err) { console.error("Admin notify error:", err); }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Method not allowed." }); return; }

  const {
    slotId         = "",
    fullName       = "",
    universityFull = "",
    universityAbbr = "",
    email          = "",
    phone          = "",
    bankName       = "",
    accountNumber  = "",
    accountName    = "",
    agreedToTerms  = "",
  } = (req.body ?? {}) as Record<string, string>;

  // ── Validation ─────────────────────────────────────────────────────────────
  const errors: string[] = [];
  if (!slotId.trim())         errors.push("Slot ID is required.");
  if (!fullName.trim())       errors.push("Full name is required.");
  if (!universityFull.trim()) errors.push("University name is required.");
  if (!universityAbbr.trim()) errors.push("University abbreviation is required.");
  if (!email.trim())          errors.push("Email address is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push("Please enter a valid email address.");
  if (!phone.trim())          errors.push("Phone number is required.");
  if (phone.replace(/\D/g, "").length < 10) errors.push("Please enter a valid phone number.");
  if (!bankName.trim())       errors.push("Bank name is required.");
  if (!accountNumber.trim())  errors.push("Account number is required.");
  if (normalizeBank(accountNumber).length < 10) errors.push("Please enter a valid 10-digit account number.");
  if (!accountName.trim())    errors.push("Account name is required.");
  if (agreedToTerms !== "true") errors.push("You must agree to the EduCraft Ambassador Terms to continue.");

  if (errors.length > 0) { res.status(400).json({ error: errors[0], errors }); return; }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(200).json({ success: true, status: "pending", note: "tracking_not_configured" }); return; }

  const id = slotId.trim().padStart(3, "0");
  const normEmail  = normalize(email);
  const normPhone  = phone.replace(/\D/g, "");
  const normBank   = normalizeBank(accountNumber);
  const normName   = normalize(fullName);

  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    // ── Duplicate detection ──────────────────────────────────────────────────
    const [
      slotTaken,
      emailExists,
      phoneExists,
      bankExists,
    ] = await Promise.all([
      client.sIsMember("application_ids", id)
        .then(v => v || client!.sIsMember("approved_ids", id))
        .then(v => v || client!.sIsMember("pending_ids", id)),
      client.sIsMember("app_emails", normEmail),
      client.sIsMember("app_phones", normPhone),
      client.sIsMember("app_banks", normBank),
    ]);

    // Also check if name is very similar (exact match after normalize)
    const nameKey = await client.get(`app_name:${normName}`);

    if (slotTaken)    { await client.disconnect(); res.status(409).json({ error: "This slot ID is already taken. Please refresh the page to get a new slot." }); return; }
    if (emailExists)  { await client.disconnect(); res.status(409).json({ error: "This email address has already been used to apply. If you think this is a mistake, please contact us at help.educraft@gmail.com." }); return; }
    if (phoneExists)  { await client.disconnect(); res.status(409).json({ error: "This phone number has already been used to apply. If you think this is a mistake, please contact us at help.educraft@gmail.com." }); return; }
    if (bankExists)   { await client.disconnect(); res.status(409).json({ error: "This bank account number has already been registered. Each ambassador must use a unique account." }); return; }
    if (nameKey)      { await client.disconnect(); res.status(409).json({ error: "An application with a very similar name already exists. If this is you, please contact EduCraft instead of reapplying." }); return; }

    const application = {
      slotId:         id,
      fullName:       fullName.trim(),
      universityFull: universityFull.trim(),
      universityAbbr: universityAbbr.trim().toUpperCase(),
      email:          normEmail,
      phone:          phone.trim(),
      bankName:       bankName.trim(),
      accountNumber:  accountNumber.trim(),
      accountName:    accountName.trim(),
      agreedToTerms:  "true",
      submittedAt:    new Date().toISOString(),
      status:         "pending",
    };

    // Store the application and all uniqueness indexes atomically
    await client.multi()
      .set(`application:${id}`, JSON.stringify(application))
      .sAdd("application_ids", id)
      .sAdd("app_emails", normEmail)
      .sAdd("app_phones", normPhone)
      .sAdd("app_banks", normBank)
      .set(`app_name:${normName}`, id)
      .set("slot_counter", String(parseInt(id, 10)))
      .exec();

    await client.disconnect();

    // Notify admin — awaited so Vercel doesn't kill it
    await notifyAdmin({ ...application });

    res.status(200).json({ success: true, status: "pending", slotId: id });

  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("apply error:", err);
    res.status(500).json({ error: "Application failed. Please try again." });
  }
}
