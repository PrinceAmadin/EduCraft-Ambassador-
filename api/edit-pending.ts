// api/edit-pending.ts
// Admin edits a pending ambassador's registration details before approving.
// Saves the corrected profile back to Redis and logs the reason for change.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const {
    originalSlotId = "",  // the ID used to find the record in Redis
    slotId         = "",  // corrected slot ID (may differ from original)
    name           = "",
    school         = "",
    email          = "",
    changeReason   = "",
    adminSecret    = "",
  } = (req.body ?? {}) as Record<string, string>;

  if (!originalSlotId.trim()) { res.status(400).json({ error: "originalSlotId is required." }); return; }
  if (!slotId.trim())         { res.status(400).json({ error: "Slot ID is required." }); return; }
  if (!name.trim())           { res.status(400).json({ error: "Name is required." }); return; }
  if (!email.trim())          { res.status(400).json({ error: "Email is required." }); return; }

  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(503).json({ error: "Tracking not configured." }); return; }

  const origId = originalSlotId.trim().toUpperCase();
  const newId  = slotId.trim().toUpperCase();

  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    // Make sure the original pending record exists
    const existing = await client.get(`pending:${origId}`);
    if (!existing) {
      await client.disconnect();
      res.status(404).json({ error: "No pending registration found for this Slot ID." });
      return;
    }

    const oldProfile = JSON.parse(existing) as Record<string, string>;

    const updatedProfile = {
      ...oldProfile,
      slotId:         newId,
      name:           name.trim(),
      school:         school.trim(),
      email:          email.trim().toLowerCase(),
      // Record the admin correction for audit trail
      adminCorrected: true,
      changeReason:   changeReason.trim() || "Corrected by admin before approval.",
      originalData: {
        slotId: oldProfile.slotId,
        name:   oldProfile.name,
        school: oldProfile.school,
        email:  oldProfile.email,
      },
      correctedAt: new Date().toISOString(),
    };

    // If slot ID changed, move the record to the new key
    if (origId !== newId) {
      // Make sure the new slot ID isn't already pending or approved
      const newAlreadyPending  = await client.sIsMember("pending_ids",  newId);
      const newAlreadyApproved = await client.sIsMember("approved_ids", newId);
      if (newAlreadyPending || newAlreadyApproved) {
        await client.disconnect();
        res.status(409).json({ error: `Slot ID ${newId} is already in use. Choose a different slot ID.` });
        return;
      }

      // Remove old, create new
      await client.multi()
        .del(`pending:${origId}`)
        .sRem("pending_ids", origId)
        .set(`pending:${newId}`, JSON.stringify(updatedProfile))
        .sAdd("pending_ids", newId)
        .exec();
    } else {
      // Same slot ID — just update the value
      await client.set(`pending:${origId}`, JSON.stringify(updatedProfile));
    }

    await client.disconnect();
    res.status(200).json({ success: true, updatedProfile });
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("edit-pending error:", err);
    res.status(500).json({ error: "Failed to update registration. Please try again." });
  }
}
