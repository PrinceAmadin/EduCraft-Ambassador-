// api/track-order.ts — Log a confirmed order + email the ambassador
// Uses REDIS_URL (Redis Cloud) + Resend for emails.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const {
    slotId      = "",
    jobDesc     = "",
    adminSecret = "",
  } = (req.body ?? {}) as Record<string, string>;

  if (!slotId.trim()) { res.status(400).json({ error: "slotId is required." }); return; }

  const {
    REDIS_URL:        redisUrl,
    RESEND_API_KEY:   resendKey,
    RESEND_FROM:      resendFrom,
    ADMIN_SECRET:     expectedSecret,
  } = process.env;

  // Auth guard
  if (expectedSecret && adminSecret !== expectedSecret) {
    res.status(401).json({ error: "Invalid admin secret." });
    return;
  }

  if (!redisUrl) {
    res.status(503).json({ error: "Tracking not configured. Add REDIS_URL to Vercel environment variables." });
    return;
  }

  const normalizedId  = slotId.trim().toUpperCase();
  const orderRecord   = JSON.stringify({ timestamp: new Date().toISOString(), jobDesc: jobDesc.trim() });

  let emailSent = false;
  let emailTo   = "";

  try {
    const client = createClient({ url: redisUrl });
    client.on("error", () => { /* suppress */ });
    await client.connect();

    // Log the order
    await client.multi()
      .incr(`orders:${normalizedId}`)
      .lPush(`orders:${normalizedId}:log`, orderRecord)
      .sAdd("ambassador_ids", normalizedId)
      .exec();

    // Fetch profile for email
    const profileStr = await client.get(`profile:${normalizedId}`);
    await client.disconnect();

    if (profileStr && resendKey) {
      try {
        const profile = JSON.parse(profileStr) as { name: string; email: string };
        if (profile.email) {
          emailTo = profile.email;
          const fromAddr = resendFrom || "EduCraft <onboarding@resend.dev>";
          const emailResp = await fetch("https://api.resend.com/emails", {
            method:  "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from:    fromAddr,
              to:      [profile.email],
              subject: "🎉 You just earned a referral commission!",
              html:    buildEmail(profile.name, jobDesc.trim()),
            }),
          });
          emailSent = emailResp.ok;
        }
      } catch { /* profile parse error — order still logged */ }
    }
  } catch (err) {
    console.error("Redis track-order error:", err);
    res.status(500).json({ error: "Failed to log order. Please try again." });
    return;
  }

  res.status(200).json({ success: true, emailSent, emailTo });
}

function buildEmail(name: string, jobDesc: string): string {
  const jobBlock = jobDesc
    ? `<div style="background:#FFF9ED;border-left:4px solid #fbdb21;border-radius:0 8px 8px 0;padding:14px 18px;margin:20px 0;color:#0D5753;font-size:.9rem;line-height:1.6"><strong>Job Details:</strong><br/>${jobDesc}</div>`
    : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="font-family:'Segoe UI',sans-serif;background:#FFF9ED;margin:0;padding:32px 16px"><div style="max-width:480px;margin:0 auto;background:#fff;border:2px solid #E0B846;border-radius:16px;padding:40px 36px"><div style="text-align:center;margin-bottom:28px"><div style="font-size:2.8rem">🎉</div><h1 style="color:#0D5753;font-size:1.4rem;font-weight:800;margin:12px 0 0">You earned a referral!</h1></div><p style="color:#0D5753;line-height:1.7;margin:0 0 14px">Hi <strong>${name}</strong>,</p><p style="color:#0D5753;line-height:1.7;margin:0 0 14px">Your EduCraft referral link just brought in a confirmed new order! Your commission will be processed by the EduCraft team.</p>${jobBlock}<p style="color:#0D5753;line-height:1.7;margin:0">Keep sharing your link — the more clients you refer, the more you earn!</p><div style="margin-top:28px;padding-top:20px;border-top:1px solid #E0B846;text-align:center;font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.08em">EDUCRAFT — Academic &amp; Technical Documentation Experts</div></div></body></html>`;
}
