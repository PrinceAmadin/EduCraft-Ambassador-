// api/_mailer.ts — shared Gmail transporter
// Requires GMAIL_APP_PASSWORD env var (16-char Google App Password).
// How to get it:
//   1. myaccount.google.com → Security → 2-Step Verification (enable)
//   2. Search "App passwords" → Mail → Generate → copy the 16-char code
//   3. Add as GMAIL_APP_PASSWORD in Vercel Environment Variables

import nodemailer from "nodemailer";

export const EDUCRAFT_EMAIL = "EduCraft611@gmail.com";

export function getMailer() {
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!pass) return null; // email not configured — callers handle gracefully
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: EDUCRAFT_EMAIL, pass },
  });
}

export async function sendMail(opts: {
  to:      string;
  subject: string;
  html:    string;
}): Promise<boolean> {
  const mailer = getMailer();
  if (!mailer) return false;
  try {
    await mailer.sendMail({ from: `"EduCraft" <${EDUCRAFT_EMAIL}>`, ...opts });
    return true;
  } catch (err) {
    console.error("Gmail send error:", err);
    return false;
  }
}
