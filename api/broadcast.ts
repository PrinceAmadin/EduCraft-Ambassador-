// api/broadcast.ts — sends an email to ALL approved/registered ambassadors
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";
import nodemailer from "nodemailer";

const GMAIL = "EduCraft611@gmail.com";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const { subject = "", message = "", adminSecret = "" } = (req.body ?? {}) as Record<string, string>;
  if (!subject.trim()) { res.status(400).json({ error: "Subject is required." }); return; }
  if (!message.trim()) { res.status(400).json({ error: "Message is required." }); return; }

  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }

  const redisUrl = process.env.REDIS_URL;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!redisUrl)   { res.status(503).json({ error: "Tracking not configured. Add REDIS_URL to Vercel." }); return; }
  if (!gmailPass)  { res.status(503).json({ error: "Gmail not configured. Add GMAIL_APP_PASSWORD to Vercel." }); return; }

  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    // Get all approved ambassador IDs
    const approvedIds = await client.sMembers("approved_ids");
    if (approvedIds.length === 0) {
      await client.disconnect();
      res.status(200).json({ success: true, sent: 0, failed: 0, message: "No registered ambassadors to send to." });
      return;
    }

    // Fetch all profiles
    const profileStrs = await Promise.all(approvedIds.map(id => client!.get(`profile:${id}`)));
    await client.disconnect();

    const emails: string[] = profileStrs
      .filter(Boolean)
      .map(s => { try { return JSON.parse(s!).email; } catch { return null; } })
      .filter((e): e is string => !!e && e.includes("@"));

    if (emails.length === 0) {
      res.status(200).json({ success: true, sent: 0, failed: 0, message: "No valid email addresses found." });
      return;
    }

    const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: GMAIL, pass: gmailPass } });

    // Send individually (not BCC) so each ambassador gets a personal email
    let sent = 0, failed = 0;
    for (const email of emails) {
      try {
        await transport.sendMail({
          from:    `"EduCraft" <${GMAIL}>`,
          to:      email,
          subject: subject.trim(),
          html:    broadcastHtml(subject.trim(), message.trim()),
        });
        sent++;
      } catch { failed++; }
    }

    res.status(200).json({ success: true, sent, failed, total: emails.length });
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("broadcast error:", err);
    res.status(500).json({ error: "Broadcast failed. Please try again." });
  }
}

function broadcastHtml(subject: string, message: string): string {
  // Convert newlines to <br> for HTML
  const body = message.replace(/\n/g, "<br/>");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f5f5f5;margin:0;padding:32px 16px">
<div style="max-width:520px;margin:0 auto;background:#ffffff;border-top:4px solid #12827c;border-radius:4px;padding:40px 40px 32px">
  <div style="margin-bottom:24px">
    <div style="font-size:0.78rem;font-weight:700;color:#12827c;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:6px">EduCraft — Ambassador Update</div>
    <h1 style="color:#0D5753;font-size:1.3rem;font-weight:700;margin:0;line-height:1.3">${subject}</h1>
  </div>
  <div style="color:#333;line-height:1.8;font-size:0.92rem">${body}</div>
  <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e8e8e8;font-size:0.75rem;color:#888;line-height:1.6">
    <strong style="color:#12827c">EDUCRAFT</strong> — Academic &amp; Technical Documentation Experts<br/>
    This message was sent to all active EduCraft Ambassadors. Please do not reply to this email.
  </div>
</div>
</body></html>`;
}
