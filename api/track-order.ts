// api/track-order.ts
// Logs a confirmed order and emails the ambassador via Gmail.
// Includes commission auto-calculation from job amount.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClient } from "./_redis";
import { sendMail } from "./_mailer";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const {
    slotId            = "",
    jobDesc           = "",
    jobAmount         = "",
    commissionPercent = "10",
    adminSecret       = "",
  } = (req.body ?? {}) as Record<string, string>;

  if (!slotId.trim()) { res.status(400).json({ error: "slotId is required." }); return; }

  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }
  if (!process.env.REDIS_URL) { res.status(503).json({ error: "Tracking not configured. Add REDIS_URL to Vercel." }); return; }

  const id     = slotId.trim().toUpperCase();
  const record = JSON.stringify({
    timestamp:         new Date().toISOString(),
    jobDesc:           jobDesc.trim(),
    jobAmount:         jobAmount.trim(),
    commissionPercent: commissionPercent.trim(),
  });

  let emailSent   = false;
  let emailTo     = "";
  // Possible reasons: "sent" | "no_profile" | "no_gmail_password" | "send_failed"
  let emailReason = "no_profile";

  try {
    const client = await getClient();

    // ── Log the order ────────────────────────────────────────────────────────
    await client.multi()
      .incr(`orders:${id}`)
      .lPush(`orders:${id}:log`, record)
      .sAdd("ambassador_ids", id)
      .exec();

    // ── Fetch the APPROVED profile (stored under profile: key after approval) ─
    const profileStr = await client.get(`profile:${id}`);
    await client.disconnect();

    if (!profileStr) {
      // Ambassador has not been approved yet — order is still logged
      emailReason = "no_profile";
    } else {
      const profile = JSON.parse(profileStr) as { name: string; email: string };
      emailTo = profile.email ?? "";

      if (!emailTo) {
        emailReason = "no_email";
      } else if (!process.env.GMAIL_APP_PASSWORD) {
        emailReason = "no_gmail_password";
      } else {
        // Calculate commission
        const amount     = parseFloat(jobAmount.replace(/,/g, "")) || 0;
        const pct        = parseFloat(commissionPercent) || 10;
        const commission = amount > 0 ? amount * (pct / 100) : 0;

        emailSent = await sendMail({
          to:      emailTo,
          subject: "🎉 You just earned a referral commission! — EduCraft",
          html:    commissionEmail(profile.name, jobDesc.trim(), amount, pct, commission),
        });
        emailReason = emailSent ? "sent" : "send_failed";
      }
    }
  } catch (err) {
    console.error("track-order error:", err);
    res.status(500).json({ error: "Failed to log order. Please try again." });
    return;
  }

  res.status(200).json({ success: true, emailSent, emailTo, emailReason });
}

// ── Commission email template ──────────────────────────────────────────────────
function commissionEmail(
  name:       string,
  jobDesc:    string,
  amount:     number,
  pct:        number,
  commission: number,
): string {
  const jobBlock = jobDesc
    ? `<div style="background:#FFF9ED;border-left:4px solid #fbdb21;border-radius:0 8px 8px 0;padding:14px 18px;margin:18px 0;color:#0D5753;font-size:.88rem;line-height:1.6"><strong>Job Details:</strong><br/>${jobDesc}</div>`
    : "";

  const commBlock = amount > 0
    ? `<div style="background:#FFF9ED;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
        <div style="font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.06em;margin-bottom:8px">YOUR COMMISSION</div>
        <div style="font-size:2.2rem;font-weight:900;color:#0D5753">₦${commission.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        <div style="font-size:.82rem;color:#888;margin-top:6px">${pct}% of ₦${amount.toLocaleString("en-NG")}</div>
       </div>`
    : `<div style="background:#FFF9ED;border-radius:12px;padding:16px;margin:20px 0;text-align:center;color:#12827c;font-weight:700">
        Commission Earned ✓ — EduCraft will confirm your exact amount shortly.
       </div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="font-family:'Segoe UI',sans-serif;background:#FFF9ED;margin:0;padding:32px 16px">
<div style="max-width:480px;margin:0 auto;background:#fff;border:2px solid #E0B846;border-radius:16px;padding:40px 36px">
  <div style="text-align:center;margin-bottom:24px"><div style="font-size:2.8rem">🎉</div>
    <h1 style="color:#0D5753;font-size:1.4rem;font-weight:800;margin:12px 0 0">You earned a referral!</h1></div>
  <p style="color:#0D5753;line-height:1.7;margin:0 0 12px">Hi <strong>${name}</strong>,</p>
  <p style="color:#0D5753;line-height:1.7;margin:0 0 4px">Your EduCraft referral link just brought in a confirmed new order!</p>
  ${jobBlock}
  ${commBlock}
  <p style="color:#0D5753;line-height:1.7;margin:0">Keep sharing your link — the more clients you refer, the more you earn! 🚀</p>
  <div style="margin-top:28px;padding-top:18px;border-top:1px solid #E0B846;text-align:center;font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.08em">
    EDUCRAFT — Academic &amp; Technical Documentation Experts</div>
</div></body></html>`;
}
