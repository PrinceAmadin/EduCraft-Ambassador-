// api/approve.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

const GMAIL = "EduCraft611@gmail.com";

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return false;
  try {
    const t = nodemailer.createTransport({ service: "gmail", auth: { user: GMAIL, pass } });
    await t.sendMail({ from: `"EduCraft" <${GMAIL}>`, to, subject, html });
    return true;
  } catch (e) { console.error("mail error:", e); return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const { slotId = "", action = "", adminSecret = "", reason = "", baseUrl = "" } = (req.body ?? {}) as Record<string, string>;
  if (!slotId)  { res.status(400).json({ error: "slotId required." }); return; }
  if (action !== "approve" && action !== "reject") { res.status(400).json({ error: "action must be approve or reject." }); return; }

  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(503).json({ error: "Tracking not configured." }); return; }

  const id = slotId.trim().toUpperCase();
  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    const profileStr = await client.get(`pending:${id}`);
    if (!profileStr) { await client.disconnect(); res.status(404).json({ error: "No pending registration found for this Slot ID." }); return; }

    const profile = JSON.parse(profileStr) as { slotId: string; name: string; school: string; email: string; registeredAt: string };

    if (action === "approve") {
      await client.multi()
        .set(`profile:${id}`, JSON.stringify(profile))
        .del(`pending:${id}`)
        .sRem("pending_ids", id)
        .sAdd("approved_ids", id)
        .sAdd("ambassador_ids", id)
        .exec();
      await client.disconnect();

      let link = `${baseUrl}/EduCraftA/${id}`;
      if (id.startsWith("ECCA-")) link = `${baseUrl}/ECCA/${id}`;
      if (id.startsWith("ECSA-")) link = `${baseUrl}/ECSA/${id}`;

      const emailSent = await send(profile.email, "🎓 Welcome to EduCraft! Your Ambassador Link is Now Active", welcomeHtml(profile.name, id, link));
      res.status(200).json({ success: true, action: "approved", name: profile.name, email: profile.email, emailSent });

    } else {
      await client.multi().del(`pending:${id}`).sRem("pending_ids", id).exec();
      await client.disconnect();
      const emailSent = await send(profile.email, "EduCraft Ambassador Registration Update", rejectHtml(profile.name, id, reason));
      res.status(200).json({ success: true, action: "rejected", emailSent });
    }
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("approve error:", err);
    res.status(500).json({ error: "Action failed. Please try again." });
  }
}

function welcomeHtml(name: string, slotId: string, link: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:'Segoe UI',sans-serif;background:#FFF9ED;margin:0;padding:32px 16px"><div style="max-width:480px;margin:0 auto;background:#fff;border:2px solid #E0B846;border-radius:16px;padding:40px 36px"><div style="text-align:center;margin-bottom:24px"><div style="font-size:2.8rem">🎓</div><h1 style="color:#0D5753;font-size:1.35rem;font-weight:800;margin:12px 0 0">You're officially an EduCraft Ambassador!</h1></div><p style="color:#0D5753;line-height:1.7;margin:0 0 14px">Hi <strong>${name}</strong>,</p><p style="color:#0D5753;line-height:1.7;margin:0 0 20px">Your registration has been verified and approved. Your referral link is now live — every client you bring in is tracked automatically.</p><div style="background:#FFF9ED;border-radius:12px;padding:18px;text-align:center;margin-bottom:20px"><div style="font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.06em;margin-bottom:8px">YOUR AMBASSADOR LINK</div><div style="font-family:monospace;color:#0D5753;font-size:.88rem;word-break:break-all">${link}</div><div style="margin-top:6px;font-size:.75rem;color:#aaa">Slot ID: ${slotId}</div></div><p style="color:#0D5753;line-height:1.7;margin:0">Share your link — every confirmed order earns you a commission, and you'll be notified by email each time!</p><div style="margin-top:28px;padding-top:18px;border-top:1px solid #E0B846;text-align:center;font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.08em">EDUCRAFT — Academic &amp; Technical Documentation Experts</div></div></body></html>`;
}

function rejectHtml(name: string, slotId: string, reason: string) {
  const r = reason ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;padding:12px 16px;margin:16px 0;color:#0D5753;font-size:.88rem">${reason}</div>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:'Segoe UI',sans-serif;background:#FFF9ED;margin:0;padding:32px 16px"><div style="max-width:480px;margin:0 auto;background:#fff;border:2px solid #E0B846;border-radius:16px;padding:40px 36px"><h1 style="color:#0D5753;font-size:1.2rem;font-weight:800;margin:0 0 20px">Ambassador Registration Update</h1><p style="color:#0D5753;line-height:1.7;margin:0 0 14px">Hi <strong>${name}</strong>,</p><p style="color:#0D5753;line-height:1.7;margin:0 0 14px">Thank you for applying to the EduCraft Ambassador Programme. After reviewing your registration for slot <strong>${slotId}</strong>, we were unable to verify the details at this time.</p>${r}<p style="color:#0D5753;line-height:1.7;margin:0">If you believe this is a mistake, please contact us or re-submit with correct details.</p><div style="margin-top:28px;padding-top:18px;border-top:1px solid #E0B846;text-align:center;font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.08em">EDUCRAFT — Academic &amp; Technical Documentation Experts</div></div></body></html>`;
}
