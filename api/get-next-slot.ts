// api/get-next-slot.ts
// Returns the next available slot number for the application form.
// Looks at all existing slots in approved_ids + pending_ids + application_ids
// and returns the next sequential number that is free.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(503).json({ error: "Tracking not configured." }); return; }

  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    // Get the stored counter — this is the source of truth for next slot
    const counterStr = await client.get("slot_counter");
    let next = counterStr ? parseInt(counterStr, 10) + 1 : 1;

    // Also check against approved/pending/application IDs to ensure no collision
    const [approved, pending, applications] = await Promise.all([
      client.sMembers("approved_ids"),
      client.sMembers("pending_ids"),
      client.sMembers("application_ids"),
    ]);

    const allNums = new Set([...approved, ...pending, ...applications]
      .map(id => parseInt(id, 10))
      .filter(n => !isNaN(n) && n > 0)
    );

    // Find the first gap or next in sequence
    while (allNums.has(next)) next++;

    await client.disconnect();

    res.status(200).json({ slotId: String(next).padStart(3, "0"), nextNumber: next });
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("get-next-slot error:", err);
    res.status(500).json({ error: "Failed to get next slot." });
  }
}
