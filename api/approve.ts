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

      const emailSent = await send(profile.email, "EduCraft — Your Ambassador Account is Now Active", welcomeHtml(profile.name, id, link));
      res.status(200).json({ success: true, action: "approved", name: profile.name, email: profile.email, emailSent });

    } else {
      await client.multi().del(`pending:${id}`).sRem("pending_ids", id).exec();
      await client.disconnect();
      const emailSent = await send(profile.email, "EduCraft — Ambassador Registration Update", rejectHtml(profile.name, id, reason));
      res.status(200).json({ success: true, action: "rejected", emailSent });
    }
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("approve error:", err);
    res.status(500).json({ error: "Action failed. Please try again." });
  }
}

function welcomeHtml(name: string, slotId: string, link: string) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-top:4px solid #12827c;border-radius:4px;padding:40px 40px 32px">
  <div style="margin-bottom:28px">
    <div style="font-size:1rem;font-weight:700;color:#12827c;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">EduCraft</div>
    <h1 style="color:#0D5753;font-size:1.4rem;font-weight:700;margin:0;line-height:1.3">Ambassador Account Activated</h1>
  </div>
  <p style="color:#333;line-height:1.7;margin:0 0 16px">Dear ${name},</p>
  <p style="color:#333;line-height:1.7;margin:0 0 20px">Your registration has been reviewed and approved by the EduCraft team. Your referral link is now live and all client activity through it will be tracked automatically.</p>
  <div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #12827c;border-radius:2px;padding:18px 20px;margin:0 0 20px">
    <div style="font-size:0.72rem;color:#12827c;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px">Your Referral Link</div>
    <div style="font-family:monospace;color:#0D5753;font-size:0.9rem;word-break:break-all;margin-bottom:4px">${link}</div>
    <div style="font-size:0.75rem;color:#888">Slot ID: ${slotId}</div>
  </div>
  <p style="color:#333;line-height:1.7;margin:0 0 28px">Share this link with prospective clients. Each time a client places an order through your link, you will receive an email confirmation with your commission details.</p>
  <div style="border-top:1px solid #e8e8e8;padding-top:20px;font-size:0.75rem;color:#888;line-height:1.6">
    <strong style="color:#12827c">EDUCRAFT</strong> — Academic &amp; Technical Documentation Experts<br/>
    This is an automated message. Please do not reply to this email.
  </div>
</div>
</body></html>`;
}

function rejectHtml(name: string, slotId: string, reason: string) {
  const r = reason
    ? `<div style="background:#fafafa;border-left:4px solid #ccc;padding:12px 16px;margin:16px 0;color:#555;font-size:0.88rem;line-height:1.6"><strong>Note from EduCraft:</strong><br/>${reason}</div>`
    : "";
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-top:4px solid #12827c;border-radius:4px;padding:40px 40px 32px">
  <div style="margin-bottom:28px">
    <div style="font-size:1rem;font-weight:700;color:#12827c;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">EduCraft</div>
    <h1 style="color:#0D5753;font-size:1.4rem;font-weight:700;margin:0;line-height:1.3">Registration Update — Slot ${slotId}</h1>
  </div>
  <p style="color:#333;line-height:1.7;margin:0 0 16px">Dear ${name},</p>
  <p style="color:#333;line-height:1.7;margin:0 0 16px">Thank you for applying to the EduCraft Ambassador Programme. After reviewing your submission for slot <strong>${slotId}</strong>, we were unable to verify the provided details at this time.</p>
  ${r}
  <p style="color:#333;line-height:1.7;margin:0 0 28px">If you believe this is an error or wish to reapply with updated information, please contact your EduCraft coordinator or submit a new registration.</p>
  <div style="border-top:1px solid #e8e8e8;padding-top:20px;font-size:0.75rem;color:#888;line-height:1.6">
    <strong style="color:#12827c">EDUCRAFT</strong> — Academic &amp; Technical Documentation Experts<br/>
    This is an automated message. Please do not reply to this email.
  </div>
</div>
</body></html>`;
}
