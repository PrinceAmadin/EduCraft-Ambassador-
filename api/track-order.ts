// api/track-order.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

const GMAIL = "EduCraft611@gmail.com";

async function send(to: string, subject: string, html: string): Promise<boolean> {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return false;
  try {
    const t = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: GMAIL, pass } });
    await t.sendMail({ from: `"EduCraft" <${GMAIL}>`, to, subject, html });
    return true;
  } catch (e) { console.error("mail error:", e); return false; }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const { slotId = "", jobDesc = "", jobAmount = "", commissionPercent = "10", adminSecret = "" } = (req.body ?? {}) as Record<string, string>;
  if (!slotId.trim()) { res.status(400).json({ error: "slotId is required." }); return; }

  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(503).json({ error: "Tracking not configured. Add REDIS_URL to Vercel." }); return; }

  const id = slotId.trim().toUpperCase();
  const record = JSON.stringify({ timestamp: new Date().toISOString(), jobDesc: jobDesc.trim(), jobAmount: jobAmount.trim(), commissionPercent: commissionPercent.trim() });

  let emailSent = false, emailTo = "", emailReason = "no_profile";
  let client: ReturnType<typeof createClient> | null = null;

  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    await client.multi().incr(`orders:${id}`).lPush(`orders:${id}:log`, record).sAdd("ambassador_ids", id).exec();

    const profileStr = await client.get(`profile:${id}`);
    await client.disconnect();

    if (!profileStr) {
      emailReason = "no_profile";
    } else {
      const profile = JSON.parse(profileStr) as { name: string; email: string };
      emailTo = profile.email ?? "";
      if (!emailTo)                             { emailReason = "no_email"; }
      else if (!process.env.GMAIL_APP_PASSWORD) { emailReason = "no_gmail_password"; }
      else {
        const amount     = parseFloat(jobAmount.replace(/,/g, "")) || 0;
        const pct        = parseFloat(commissionPercent) || 10;
        const commission = amount > 0 ? amount * (pct / 100) : 0;
        emailSent = await send(emailTo, "EduCraft — Commission Notification", commissionHtml(profile.name, jobDesc.trim(), amount, pct, commission));
        emailReason = emailSent ? "sent" : "send_failed";
      }
    }
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("track-order error:", err);
    res.status(500).json({ error: "Failed to log order. Please try again." });
    return;
  }

  res.status(200).json({ success: true, emailSent, emailTo, emailReason });
}

function commissionHtml(name: string, jobDesc: string, amount: number, pct: number, commission: number) {
  const jobBlock = jobDesc
    ? `<div style="background:#f8f8f8;border-left:4px solid #E0B846;padding:14px 18px;margin:18px 0;color:#333;font-size:0.88rem;line-height:1.6"><strong>Job Description:</strong><br/>${jobDesc}</div>`
    : "";
  const commBlock = amount > 0
    ? `<div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #12827c;border-radius:2px;padding:18px 20px;margin:20px 0">
        <div style="font-size:0.72rem;color:#12827c;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:8px">Your Commission</div>
        <div style="font-size:1.8rem;font-weight:700;color:#0D5753;margin-bottom:4px">&#8358;${commission.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div style="font-size:0.82rem;color:#888">${pct}% of &#8358;${amount.toLocaleString("en-NG")}</div>
       </div>`
    : `<div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #12827c;border-radius:2px;padding:14px 18px;margin:20px 0;color:#0D5753;font-size:0.88rem">
        Your commission for this order will be confirmed and communicated by your EduCraft coordinator.
       </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-top:4px solid #12827c;border-radius:4px;padding:40px 40px 32px">
  <div style="margin-bottom:24px">
    <div style="font-size:1rem;font-weight:700;color:#12827c;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:4px">EduCraft</div>
    <h1 style="color:#0D5753;font-size:1.35rem;font-weight:700;margin:0;line-height:1.3">Referral Commission — New Order Confirmed</h1>
  </div>
  <p style="color:#333;line-height:1.7;margin:0 0 14px">Dear ${name},</p>
  <p style="color:#333;line-height:1.7;margin:0 0 4px">A client referred through your EduCraft ambassador link has placed a confirmed order.</p>
  ${jobBlock}
  ${commBlock}
  <p style="color:#333;line-height:1.7;margin:0 0 28px">Continue sharing your referral link to grow your commission earnings.</p>
  <div style="border-top:1px solid #e8e8e8;padding-top:20px;font-size:0.75rem;color:#888;line-height:1.6">
    <strong style="color:#12827c">EDUCRAFT</strong> — Academic &amp; Technical Documentation Experts<br/>
    This is an automated message. Please do not reply to this email.
  </div>
</div>
</body></html>`;
}
