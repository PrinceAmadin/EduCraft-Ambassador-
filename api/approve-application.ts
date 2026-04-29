// api/approve-application.ts
// Approves a pending ambassador application:
//   1. Saves profile to tracking (approved_ids, profile:id)
//   2. Sends welcome email with their referral link
//   3. Removes from application_ids (keeping bank data stored separately)

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

const ADMIN_EMAIL = "EduCraft611@gmail.com";
const BASE_URL    = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://edu-craft-ambassador.vercel.app";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const {
    slotId      = "",
    adminSecret = "",
    baseUrl     = BASE_URL,
    // Optional overrides admin can set during review
    fullName    = "",
    universityAbbr = "",
    email       = "",
  } = (req.body ?? {}) as Record<string, string>;

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

    // Apply any admin overrides
    const finalName   = fullName.trim()       || app.fullName;
    const finalAbbr   = universityAbbr.trim() || app.universityAbbr;
    const finalEmail  = email.trim()          || app.email;

    const profile = {
      slotId:   id,
      name:     finalName,
      school:   finalAbbr,
      email:    finalEmail,
      registeredAt: new Date().toISOString(),
    };

    // Store bank details separately (for payment records)
    const paymentRecord = {
      slotId:        id,
      name:          finalName,
      bankName:      app.bankName,
      accountNumber: app.accountNumber,
      accountName:   app.accountName,
      email:         finalEmail,
      phone:         app.phone,
      universityFull: app.universityFull,
      universityAbbr: finalAbbr,
      approvedAt:    new Date().toISOString(),
    };

    // Update application status to approved
    const approvedApp = { ...app, status: "approved", approvedAt: new Date().toISOString(), finalName, finalEmail, finalAbbr };

    await client.multi()
      // Tracking
      .set(`profile:${id}`, JSON.stringify(profile))
      .sAdd("approved_ids", id)
      .sAdd("ambassador_ids", id)
      // Payment record (persisted separately)
      .set(`payment:${id}`, JSON.stringify(paymentRecord))
      .sAdd("payment_ids", id)
      // Mark application as approved (keep for records)
      .set(`application:${id}`, JSON.stringify(approvedApp))
      .sRem("application_ids", id)
      .sAdd("approved_application_ids", id)
      .exec();

    await client.disconnect();

    // Send welcome email
    const link = `${baseUrl}/EduCraftA/${id}`;
    let emailSent = false;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    if (gmailPass) {
      try {
        const t = nodemailer.createTransport({
          host: "smtp.gmail.com", port: 465, secure: true,
          auth: { user: ADMIN_EMAIL, pass: gmailPass },
          socketTimeout: 15000, connectionTimeout: 10000,
        });
        await t.sendMail({
          from:    `"EduCraft" <${ADMIN_EMAIL}>`,
          to:      finalEmail,
          subject: "Welcome to EduCraft — Your Ambassador Account is Active",
          html:    welcomeEmail(finalName, id, link, finalAbbr),
        });
        emailSent = true;
      } catch (e) { console.error("Welcome email error:", e); }
    }

    res.status(200).json({ success: true, slotId: id, name: finalName, email: finalEmail, link, emailSent });

  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("approve-application error:", err);
    res.status(500).json({ error: "Approval failed. Please try again." });
  }
}

function welcomeEmail(name: string, slotId: string, link: string, school: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px 40px 32px">
  <div style="margin-bottom:28px">
    <div style="font-size:0.75rem;font-weight:700;color:#12827c;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">EduCraft Ambassador Programme</div>
    <h1 style="color:#0D5753;font-size:1.4rem;font-weight:700;margin:0;line-height:1.3">Welcome aboard, ${name}!</h1>
  </div>
  <p style="color:#333;line-height:1.7;margin:0 0 16px">Your application has been reviewed and approved by the EduCraft team. You are now an official EduCraft Ambassador at <strong>${school}</strong>.</p>
  <p style="color:#333;line-height:1.7;margin:0 0 20px">Your referral link is live. Every client who places an order through it earns you a <strong>10% commission</strong> — and you will be notified by email each time.</p>
  <div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #12827c;border-radius:2px;padding:20px;margin:0 0 20px">
    <div style="font-size:0.72rem;color:#12827c;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;margin-bottom:10px">Your Referral Link</div>
    <div style="font-family:monospace;color:#0D5753;font-size:0.92rem;word-break:break-all;margin-bottom:6px">${link}</div>
    <div style="font-size:0.76rem;color:#aaa">Slot ID: EduCraftA-${slotId}</div>
  </div>
  <div style="background:#FFF9ED;border:1px solid #E0B846;border-radius:4px;padding:16px 18px;margin:0 0 24px;font-size:0.87rem;color:#0D5753;line-height:1.8">
    <strong>How it works:</strong><br/>
    1. Share your link with potential clients<br/>
    2. When they message EduCraft, your name is included automatically<br/>
    3. When the order is confirmed, you earn 10% commission<br/>
    4. You will receive an email notification with your earnings
  </div>
  <p style="color:#333;line-height:1.7;margin:0 0 24px">If you have any questions, please reach out to your EduCraft coordinator directly.</p>
  <div style="border-top:1px solid #e8e8e8;padding-top:20px;font-size:0.75rem;color:#888;line-height:1.6">
    <strong style="color:#12827c">EDUCRAFT</strong> — Academic &amp; Technical Documentation Experts<br/>
    This is an automated confirmation. Please do not reply to this email.
  </div>
</div>
</body></html>`;
}
