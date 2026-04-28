// api/track-order.ts
// Admin endpoint: log a confirmed order for an ambassador slot and
// automatically email the ambassador their commission notification.
//
// Required Vercel env vars:
//   UPSTASH_REDIS_REST_URL    — from upstash.com → your Redis DB → REST API
//   UPSTASH_REDIS_REST_TOKEN  — same place
//   RESEND_API_KEY            — from resend.com → API Keys
//   RESEND_FROM               — ✏️ e.g. "EduCraft <notifications@yourdomain.com>"
//                               (must be a verified domain in Resend)
//   ADMIN_SECRET              — any password string you choose; protects this endpoint

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const {
    slotId,
    jobDesc     = "",
    adminSecret = "",
  } = (req.body ?? {}) as Record<string, string>;

  if (!slotId?.trim()) { res.status(400).json({ error: "slotId is required." }); return; }

  const {
    UPSTASH_REDIS_REST_URL:   url,
    UPSTASH_REDIS_REST_TOKEN: token,
    RESEND_API_KEY:           resendKey,
    RESEND_FROM:              resendFrom,
    ADMIN_SECRET:             expectedSecret,
  } = process.env;

  // ── Auth guard ────────────────────────────────────────────────────────────
  // If ADMIN_SECRET is set, require the caller to supply it.
  if (expectedSecret && adminSecret !== expectedSecret) {
    res.status(401).json({ error: "Invalid admin secret." });
    return;
  }

  if (!url || !token) {
    res.status(503).json({ error: "Tracking not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to Vercel." });
    return;
  }

  const normalizedId  = slotId.trim().toUpperCase();
  const orderRecord   = JSON.stringify({ timestamp: new Date().toISOString(), jobDesc: jobDesc.trim() });

  // ── 1. Log the order in Redis ─────────────────────────────────────────────
  await fetch(`${url}/pipeline`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      ["INCR",  `orders:${normalizedId}`],                 // increment order counter
      ["LPUSH", `orders:${normalizedId}:log`, orderRecord], // prepend to order log
      ["SADD",  "ambassador_ids", normalizedId],            // ensure ID is tracked
    ]),
  });

  // ── 2. Fetch ambassador profile for email ─────────────────────────────────
  let emailSent = false;
  let emailTo   = "";

  const profileResp = await fetch(`${url}/pipeline`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([["GET", `profile:${normalizedId}`]]),
  });

  if (profileResp.ok && resendKey) {
    const profileData = await profileResp.json();
    const profileStr  = profileData?.[0]?.result as string | null;

    if (profileStr) {
      try {
        const profile = JSON.parse(profileStr) as { name: string; email: string };

        if (profile.email) {
          emailTo = profile.email;

          // ── 3. Send email via Resend REST API ─────────────────────────────
          const fromAddr = resendFrom || "EduCraft <onboarding@resend.dev>";

          const emailResp = await fetch("https://api.resend.com/emails", {
            method:  "POST",
            headers: {
              Authorization:  `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from:    fromAddr,
              to:      [profile.email],
              subject: "🎉 You just earned a referral commission!",
              html:    buildEmailHtml(profile.name, jobDesc.trim()),
            }),
          });

          emailSent = emailResp.ok;
        }
      } catch {
        // Profile parse error — order is still logged, email just won't send
      }
    }
  }

  res.status(200).json({ success: true, emailSent, emailTo });
}

// ─── Email HTML template ──────────────────────────────────────────────────────
function buildEmailHtml(name: string, jobDesc: string): string {
  const jobBlock = jobDesc
    ? `<div style="background:#FFF9ED;border-left:4px solid #fbdb21;border-radius:0 8px 8px 0;
                  padding:14px 18px;margin:20px 0;color:#0D5753;font-size:.9rem;line-height:1.6">
         <strong>Job Details:</strong><br/>${jobDesc}
       </div>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
</head>
<body style="font-family:'Segoe UI',sans-serif;background:#FFF9ED;margin:0;padding:32px 16px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:2px solid #E0B846;
              border-radius:16px;padding:40px 36px;box-shadow:0 4px 24px rgba(13,87,83,.1)">

    <div style="text-align:center;margin-bottom:28px">
      <div style="font-size:2.8rem">🎉</div>
      <h1 style="color:#0D5753;font-size:1.4rem;font-weight:800;margin:12px 0 0">
        You earned a referral!
      </h1>
    </div>

    <p style="color:#0D5753;line-height:1.7;margin:0 0 14px">
      Hi <strong>${name}</strong>,
    </p>
    <p style="color:#0D5753;line-height:1.7;margin:0 0 14px">
      Your EduCraft referral link just brought in a confirmed new order.
      Your commission for this job will be processed by the EduCraft team.
    </p>

    ${jobBlock}

    <div style="background:#FFF9ED;border-radius:12px;padding:20px;margin:20px 0;text-align:center">
      <div style="font-size:1.5rem;font-weight:900;color:#12827c">Commission Earned ✓</div>
      <div style="font-size:.82rem;color:#0D5753;margin-top:6px;font-weight:600">
        Your coordinator will confirm the exact amount
      </div>
    </div>

    <p style="color:#0D5753;line-height:1.7;margin:0">
      Keep sharing your link — the more clients you refer, the more you earn!
    </p>

    <div style="margin-top:28px;padding-top:20px;border-top:1px solid #E0B846;
                text-align:center;font-size:.72rem;color:#12827c;font-weight:700;
                letter-spacing:.08em">
      EDUCRAFT — Academic &amp; Technical Documentation Experts
    </div>
  </div>
</body>
</html>`;
}
