// api/reset-slot.ts — clears ALL tracking data for a slot so a new ambassador can start fresh
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed." }); return; }

  const { slotId = "", adminSecret = "" } = (req.body ?? {}) as Record<string, string>;
  if (!slotId.trim()) { res.status(400).json({ error: "slotId is required." }); return; }

  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && adminSecret !== expected) { res.status(401).json({ error: "Invalid admin secret." }); return; }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(503).json({ error: "Tracking not configured." }); return; }

  const id = slotId.trim().toUpperCase();
  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    // Clear EVERYTHING for this slot: profile, approval status, clicks, orders, order log
    await client.multi()
      .del(`profile:${id}`)
      .del(`pending:${id}`)
      .del(`clicks:${id}`)
      .del(`orders:${id}`)
      .del(`orders:${id}:log`)
      .sRem("approved_ids", id)
      .sRem("pending_ids", id)
      .sRem("ambassador_ids", id)
      .exec();

    await client.disconnect();
    res.status(200).json({ success: true, message: `Slot ${id} fully reset. All clicks, orders, and registration data cleared.` });
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("reset-slot error:", err);
    res.status(500).json({ error: "Failed to reset slot. Please try again." });
  }
}
