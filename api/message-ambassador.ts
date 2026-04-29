// api/message-ambassador.ts
// Sends a custom one-off email to a single ambassador by slot ID.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

const ADMIN_EMAIL = "EduCraft611@gmail.com";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const {
    slotId      = "",
    title       = "",
    message     = "",
    adminSecret = "",
  } = (req.body ?? {}) as Record<string, string>;

  if (!slotId.trim())   { res.status(400).json({ error: "slotId is required." }); return; }
  if (!title.trim())    { res.status(400).json({ error: "Title is required." }); return; }
  if (!message.trim())  { res.status(400).json({ error: "Message is required." }); return; }

  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }

  const redisUrl  = process.env.REDIS_URL;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!redisUrl)  { res.status(503).json({ error: "Tracking not configured. Add REDIS_URL to Vercel." }); return; }
  if (!gmailPass) { res.status(503).json({ error: "Gmail not configured. Add GMAIL_APP_PASSWORD to Vercel." }); return; }

  const id = slotId.trim().toUpperCase();
  let client: ReturnType<typeof createClient> | null = null;

  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    const profileStr = await client.get(`profile:${id}`);
    await client.disconnect();

    if (!profileStr) {
      res.status(404).json({ error: "This ambassador has not registered their email yet. Ask them to register at /register first." });
      return;
    }

    const profile = JSON.parse(profileStr) as { name: string; email: string };
    if (!profile.email) {
      res.status(404).json({ error: "No email found for this ambassador." });
      return;
    }

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: ADMIN_EMAIL, pass: gmailPass },
      socketTimeout: 15000, connectionTimeout: 10000,
    });

    await transport.sendMail({
      from:    `"EduCraft" <${ADMIN_EMAIL}>`,
      to:      profile.email,
      subject: title.trim(),
      html:    buildHtml(profile.name, title.trim(), message.trim()),
    });

    res.status(200).json({ success: true, sentTo: profile.email, name: profile.name });

  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("message-ambassador error:", err);
    res.status(500).json({ error: `Failed to send: ${String(err)}` });
  }
}

function buildHtml(name: string, title: string, message: string): string {
  const body = message.replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-top:4px solid #12827c;border-radius:4px;padding:40px 40px 32px">
  <div style="margin-bottom:24px">
    <div style="font-size:0.75rem;font-weight:700;color:#12827c;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">EduCraft — Message for You</div>
    <h1 style="color:#0D5753;font-size:1.25rem;font-weight:700;margin:0;line-height:1.3">${title}</h1>
  </div>
  <p style="color:#333;line-height:1.7;margin:0 0 16px">Dear <strong>${name}</strong>,</p>
  <div style="color:#333;line-height:1.8;font-size:0.92rem;margin-bottom:28px">${body}</div>
  <div style="border-top:1px solid #e8e8e8;padding-top:20px;font-size:0.75rem;color:#888;line-height:1.6">
    <strong style="color:#12827c">EDUCRAFT</strong> — Academic &amp; Technical Documentation Experts<br/>
    This message was sent directly to you by the EduCraft admin team.
  </div>
</div>
</body></html>`;
}
