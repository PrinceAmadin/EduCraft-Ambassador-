// api/test-email.ts — sends a test email so you can verify Gmail works from any device
import type { VercelRequest, VercelResponse } from "@vercel/node";
import nodemailer from "nodemailer";

const ADMIN_EMAIL = "EduCraft611@gmail.com";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const { adminSecret = "" } = (req.body ?? {}) as Record<string, string>;
  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }

  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!gmailPass) {
    res.status(503).json({
      error: "GMAIL_APP_PASSWORD is not set in this environment.",
      env: process.env.VERCEL_ENV ?? "unknown",
      hint: "Go to Vercel → Settings → Environment Variables → GMAIL_APP_PASSWORD → make sure Production is checked → Save → Redeploy."
    });
    return;
  }

  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com", port: 465, secure: true,
      auth: { user: ADMIN_EMAIL, pass: gmailPass },
      socketTimeout: 15000, connectionTimeout: 10000,
    });
    await transport.sendMail({
      from: `"EduCraft System" <${ADMIN_EMAIL}>`,
      to:   ADMIN_EMAIL,
      subject: "EduCraft — Email Test Successful",
      html: `<div style="font-family:sans-serif;padding:24px;max-width:400px">
        <h2 style="color:#0D5753">Email is working</h2>
        <p>This test was triggered from: <strong>${process.env.VERCEL_ENV ?? "unknown"}</strong> environment.</p>
        <p style="color:#888;font-size:0.8rem">EduCraft Ambassador System</p>
      </div>`,
    });
    res.status(200).json({ success: true, env: process.env.VERCEL_ENV ?? "unknown", message: "Test email sent to EduCraft611@gmail.com" });
  } catch (err) {
    res.status(500).json({ success: false, error: String(err), env: process.env.VERCEL_ENV ?? "unknown" });
  }
}
