// api/reject-application.ts — rejects an application and notifies the applicant
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

const ADMIN_EMAIL = "EduCraft611@gmail.com";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const { slotId = "", reason = "", adminSecret = "" } = (req.body ?? {}) as Record<string, string>;
  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(503).json({ error: "Tracking not configured." }); return; }

  const id = slotId.trim().padStart(3, "0");
  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    const appStr = await client.get(`application:${id}`);
    if (!appStr) { await client.disconnect(); res.status(404).json({ error: "Application not found." }); return; }

    const app = JSON.parse(appStr) as Record<string, string>;

    // Remove all uniqueness locks so they can reapply
    const normEmail  = app.email;
    const normPhone  = app.phone?.replace(/\D/g, "") ?? "";
    const normBank   = app.accountNumber?.replace(/\D/g, "") ?? "";
    const normName   = app.fullName?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";

    await client.multi()
      .del(`application:${id}`)
      .sRem("application_ids", id)
      .sRem("app_emails", normEmail)
      .sRem("app_phones", normPhone)
      .sRem("app_banks", normBank)
      .del(`app_name:${normName}`)
      .exec();

    await client.disconnect();

    // Send rejection email
    let emailSent = false;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (gmailPass && app.email) {
      try {
        const t = nodemailer.createTransport({
          host: "smtp.gmail.com", port: 465, secure: true,
          auth: { user: ADMIN_EMAIL, pass: gmailPass },
          socketTimeout: 15000, connectionTimeout: 10000,
        });
        const reasonBlock = reason.trim()
          ? `<div style="background:#fafafa;border-left:4px solid #ccc;padding:12px 16px;margin:16px 0;color:#555;font-size:0.88rem;line-height:1.6"><strong>Reason:</strong><br/>${reason.trim()}</div>`
          : "";
        await t.sendMail({
          from:    `"EduCraft" <${ADMIN_EMAIL}>`,
          to:      app.email,
          subject: "EduCraft Ambassador Application — Update",
          html:    `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px 40px 32px">
  <h1 style="color:#0D5753;font-size:1.2rem;font-weight:700;margin:0 0 20px">Application Update — Slot ${id}</h1>
  <p style="color:#333;line-height:1.7;margin:0 0 14px">Dear <strong>${app.fullName}</strong>,</p>
  <p style="color:#333;line-height:1.7;margin:0 0 14px">Thank you for applying to the EduCraft Ambassador Programme. After reviewing your application, we are unable to proceed at this time.</p>
  ${reasonBlock}
  <p style="color:#333;line-height:1.7;margin:0 0 24px">If you believe this is an error or would like to reapply, please contact your EduCraft coordinator.</p>
  <div style="border-top:1px solid #e8e8e8;padding-top:18px;font-size:0.75rem;color:#888">
    <strong style="color:#12827c">EDUCRAFT</strong> — Academic &amp; Technical Documentation Experts
  </div>
</div></body></html>`,
        });
        emailSent = true;
      } catch (e) { console.error("Rejection email error:", e); }
    }

    res.status(200).json({ success: true, emailSent });
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    res.status(500).json({ error: "Rejection failed. Please try again." });
  }
}
