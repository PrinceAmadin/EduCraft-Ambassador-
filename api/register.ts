// api/register.ts
// Saves to Redis then sends admin notification email.
// Uses Promise.race with 20s timeout so slow mobile connections don't kill the function.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

const ADMIN_EMAIL = "EduCraft611@gmail.com";

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function notifyAdmin(profile: {
  slotId: string; name: string; school: string; email: string; registeredAt: string;
}): Promise<boolean> {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) { console.warn("GMAIL_APP_PASSWORD not set — skipping admin notification"); return false; }

  const date = new Date(profile.registeredAt).toLocaleString("en-NG", {
    dateStyle: "full", timeStyle: "short", timeZone: "Africa/Lagos",
  });

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: ADMIN_EMAIL, pass },
    // Explicit timeouts so slow connections don't hang forever
    pool: false,
    socketTimeout: 15000,
    greetingTimeout: 10000,
    connectionTimeout: 10000,
  });

  await transport.sendMail({
    from:    `"EduCraft System" <${ADMIN_EMAIL}>`,
    to:      ADMIN_EMAIL,
    subject: `[Action Required] New Ambassador Registration — Slot ${profile.slotId}`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #E0B846;border-radius:4px;padding:40px 40px 32px">
  <div style="margin-bottom:24px">
    <div style="font-size:0.75rem;font-weight:700;color:#12827c;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">EduCraft — Admin Notification</div>
    <h1 style="color:#0D5753;font-size:1.25rem;font-weight:700;margin:0;line-height:1.3">New Ambassador Registration Pending Approval</h1>
  </div>
  <p style="color:#333;line-height:1.7;margin:0 0 20px">An ambassador has submitted their details. Please verify and take action from your dashboard.</p>
  <div style="background:#f8f8f8;border:1px solid #e0e0e0;border-left:4px solid #12827c;border-radius:2px;padding:18px 20px;margin:0 0 20px">
    <table style="width:100%;border-collapse:collapse;font-size:0.9rem">
      <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#888;width:110px">Slot ID</td><td style="padding:8px 0;color:#0D5753;font-weight:700;font-family:monospace">${profile.slotId}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#888">Full Name</td><td style="padding:8px 0;color:#0D5753;font-weight:600">${profile.name}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#888">School</td><td style="padding:8px 0;color:#333">${profile.school || "— not provided —"}</td></tr>
      <tr style="border-bottom:1px solid #eee"><td style="padding:8px 0;color:#888">Email</td><td style="padding:8px 0;color:#12827c">${profile.email}</td></tr>
      <tr><td style="padding:8px 0;color:#888">Submitted</td><td style="padding:8px 0;color:#333">${date}</td></tr>
    </table>
  </div>
  <div style="background:#FFF9ED;border:1px solid #E0B846;border-radius:4px;padding:16px 18px;margin:0 0 28px;font-size:0.88rem;color:#0D5753;line-height:1.8">
    <strong>Action required:</strong> Open the EduCraft Ambassador Panel &rarr; <strong>Tracking</strong> tab &rarr; use <strong>Approve</strong>, <strong>Edit</strong>, or <strong>Reject</strong>.
  </div>
  <div style="border-top:1px solid #e8e8e8;padding-top:20px;font-size:0.75rem;color:#888;line-height:1.6">
    <strong style="color:#12827c">EDUCRAFT</strong> — Academic &amp; Technical Documentation Experts<br/>
    Automated admin alert. Do not reply.
  </div>
</div>
</body></html>`,
  });

  return true;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Method not allowed." }); return; }

  const { slotId = "", name = "", school = "", email = "" } = (req.body ?? {}) as Record<string, string>;

  if (!slotId.trim()) { res.status(400).json({ error: "Slot ID is required." }); return; }
  if (!name.trim())   { res.status(400).json({ error: "Full name is required." }); return; }
  if (!email.trim())  { res.status(400).json({ error: "Email address is required." }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "Please enter a valid email address." }); return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    res.status(200).json({ success: true, status: "pending", note: "tracking_not_configured" }); return;
  }

  const id = slotId.trim().toUpperCase();
  let client: ReturnType<typeof createClient> | null = null;

  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    if (await client.sIsMember("approved_ids", id)) {
      await client.disconnect();
      res.status(409).json({ error: "This Slot ID is already registered and active. Contact EduCraft if you think this is wrong." });
      return;
    }
    if (await client.sIsMember("pending_ids", id)) {
      await client.disconnect();
      res.status(409).json({ error: "This Slot ID already has a pending registration awaiting approval. Please wait." });
      return;
    }

    const profile = {
      slotId: id, name: name.trim(), school: school.trim(),
      email: email.trim().toLowerCase(), registeredAt: new Date().toISOString(),
    };

    await client.multi()
      .set(`pending:${id}`, JSON.stringify(profile))
      .sAdd("pending_ids", id)
      .exec();
    await client.disconnect();

    // Send admin notification — wrapped in 20s timeout so slow mobile connections
    // don't cause the function to hang. Registration already succeeded above.
    const sent = await withTimeout(
      notifyAdmin(profile).catch(err => { console.error("Notify error:", err); return false; }),
      20000,
      false
    );

    res.status(200).json({ success: true, status: "pending", adminNotified: sent });

  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
}
