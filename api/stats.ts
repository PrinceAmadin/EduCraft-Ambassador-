// api/stats.ts — Returns tracking stats for all ambassadors
// Uses REDIS_URL (Redis Cloud). Protected by ADMIN_SECRET query param.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  // Auth
  const supplied       = (req.query.secret as string | undefined) ?? "";
  const expectedSecret = process.env.ADMIN_SECRET ?? "";
  if (expectedSecret && supplied !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized. Check your Admin Secret in Tracking Settings." });
    return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    res.status(503).json({
      error: "Tracking not configured. Add REDIS_URL to your Vercel environment variables.",
    });
    return;
  }

  try {
    const client = createClient({ url: redisUrl });
    client.on("error", () => { /* suppress */ });
    await client.connect();

    // Get all ambassador IDs that have ever been tracked
    const ambassadorIds = await client.sMembers("ambassador_ids");

    if (ambassadorIds.length === 0) {
      await client.disconnect();
      res.status(200).json({});
      return;
    }

    // Fetch clicks, orders, profile for every ambassador in parallel
    const results = await Promise.all(
      ambassadorIds.map(async (id) => {
        const [clicks, orders, profileStr] = await Promise.all([
          client.get(`clicks:${id}`),
          client.get(`orders:${id}`),
          client.get(`profile:${id}`),
        ]);
        return { id, clicks, orders, profileStr };
      })
    );

    await client.disconnect();

    // Build response
    const stats: Record<string, {
      clicks: number;
      orders: number;
      email: string | null;
      registeredName: string | null;
    }> = {};

    for (const { id, clicks, orders, profileStr } of results) {
      let email:          string | null = null;
      let registeredName: string | null = null;

      if (profileStr) {
        try {
          const p = JSON.parse(profileStr) as { email?: string; name?: string };
          email          = p.email ?? null;
          registeredName = p.name  ?? null;
        } catch { /* malformed profile */ }
      }

      stats[id] = {
        clicks: parseInt(clicks  ?? "0", 10) || 0,
        orders: parseInt(orders ?? "0", 10) || 0,
        email,
        registeredName,
      };
    }

    res.status(200).json(stats);
  } catch (err) {
    console.error("Redis stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats. Check your REDIS_URL." });
  }
}
