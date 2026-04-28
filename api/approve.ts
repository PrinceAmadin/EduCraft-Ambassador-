// api/approve.ts — admin approves or rejects a pending registration
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClient } from "./_redis";
import { sendMail } from "./_mailer";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const {
    slotId      = "",
    action      = "",
    adminSecret = "",
    reason      = "",
    baseUrl     = "",
  } = (req.body ?? {}) as Record<string, string>;

  if (!slotId)  { res.status(400).json({ error: "slotId required." }); return; }
  if (action !== "approve" && action !== "reject") {
    res.status(400).json({ error: "action must be 'approve' or 'reject'." }); return;
  }

  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }
  if (!process.env.REDIS_URL) { res.status(503).json({ error: "Tracking not configured." }); return; }

  const id = slotId.trim().toUpperCase();

  try {
    const client = await getClient();

    const profileStr = await client.get(`pending:${id}`);
    if (!profileStr) {
      await client.disconnect();
      res.status(404).json({ error: "No pending registration found for this Slot ID." }); return;
    }

    const profile = JSON.parse(profileStr) as {
      slotId: string; name: string; school: string; email: string; registeredAt: string;
    };

    if (action === "approve") {
      await client.multi()
        .set(`profile:${id}`, JSON.stringify(profile)) // activate
        .del(`pending:${id}`)
        .sRem("pending_ids", id)
        .sAdd("approved_ids", id)
        .sAdd("ambassador_ids", id)
        .exec();
      await client.disconnect();

      // Determine the ambassador's referral link
      let link = `${baseUrl}/EduCraftA/${id}`;
      if (id.startsWith("ECCA-")) link = `${baseUrl}/ECCA/${id}`;
      if (id.startsWith("ECSA-")) link = `${baseUrl}/ECSA/${id}`;

      const emailSent = await sendMail({
        to:      profile.email,
        subject: "🎓 Welcome to EduCraft! Your Ambassador Link is Now Active",
        html:    welcomeEmail(profile.name, id, link),
      });

      res.status(200).json({ success: true, action: "approved", name: profile.name, email: profile.email, emailSent });

    } else {
      // Reject — delete from pending entirely
      await client.multi()
        .del(`pending:${id}`)
        .sRem("pending_ids", id)
        .exec();
      await client.disconnect();

      const emailSent = await sendMail({
        to:      profile.email,
        subject: "EduCraft Ambassador Registration Update",
        html:    rejectionEmail(profile.name, id, reason),
      });

      res.status(200).json({ success: true, action: "rejected", emailSent });
    }
  } catch (err) {
    console.error("Approve error:", err);
    res.status(500).json({ error: "Action failed. Please try again." });
  }
}

// ── Email templates ────────────────────────────────────────────────────────────
function welcomeEmail(name: string, slotId: string, link: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:'Segoe UI',sans-serif;background:#FFF9ED;margin:0;padding:32px 16px">
<div style="max-width:480px;margin:0 auto;background:#fff;border:2px solid #E0B846;border-radius:16px;padding:40px 36px">
  <div style="text-align:center;margin-bottom:24px"><div style="font-size:2.8rem">🎓</div>
    <h1 style="color:#0D5753;font-size:1.35rem;font-weight:800;margin:12px 0 0">You're officially an EduCraft Ambassador!</h1></div>
  <p style="color:#0D5753;line-height:1.7;margin:0 0 14px">Hi <strong>${name}</strong>,</p>
  <p style="color:#0D5753;line-height:1.7;margin:0 0 20px">Your registration has been verified and approved. Your referral link is now live — every client you bring in is tracked automatically.</p>
  <div style="background:#FFF9ED;border-radius:12px;padding:18px;text-align:center;margin-bottom:20px">
    <div style="font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.06em;margin-bottom:8px">YOUR AMBASSADOR LINK</div>
    <div style="font-family:monospace;color:#0D5753;font-size:.88rem;word-break:break-all">${link}</div>
    <div style="margin-top:6px;font-size:.75rem;color:#aaa">Slot ID: ${slotId}</div>
  </div>
  <p style="color:#0D5753;line-height:1.7;margin:0">Share your link — every confirmed order earns you a commission, and you'll be notified by email each time!</p>
  <div style="margin-top:28px;padding-top:18px;border-top:1px solid #E0B846;text-align:center;font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.08em">
    EDUCRAFT — Academic &amp; Technical Documentation Experts</div>
</div></body></html>`;
}

function rejectionEmail(name: string, slotId: string, reason: string): string {
  const r = reason ? `<div style="background:#fef2f2;border-left:4px solid #ef4444;border-radius:0 8px 8px 0;padding:12px 16px;margin:16px 0;color:#0D5753;font-size:.88rem">${reason}</div>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="font-family:'Segoe UI',sans-serif;background:#FFF9ED;margin:0;padding:32px 16px">
<div style="max-width:480px;margin:0 auto;background:#fff;border:2px solid #E0B846;border-radius:16px;padding:40px 36px">
  <h1 style="color:#0D5753;font-size:1.2rem;font-weight:800;margin:0 0 20px">Ambassador Registration Update</h1>
  <p style="color:#0D5753;line-height:1.7;margin:0 0 14px">Hi <strong>${name}</strong>,</p>
  <p style="color:#0D5753;line-height:1.7;margin:0 0 14px">Thank you for applying to the EduCraft Ambassador Programme. After reviewing your registration for slot <strong>${slotId}</strong>, we were unable to verify the details at this time.</p>
  ${r}
  <p style="color:#0D5753;line-height:1.7;margin:0">If you believe this is a mistake or would like to re-apply with correct details, please reach out or submit a new registration.</p>
  <div style="margin-top:28px;padding-top:18px;border-top:1px solid #E0B846;text-align:center;font-size:.72rem;color:#12827c;font-weight:700;letter-spacing:.08em">
    EDUCRAFT — Academic &amp; Technical Documentation Experts</div>
</div></body></html>`;
}
