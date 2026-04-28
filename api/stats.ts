// api/stats.ts — returns live tracking stats for all ambassador IDs
// Conv% is calculated in the frontend as: round((orders / clicks) * 100)
// This file just returns raw clicks and orders so the formula is always correct.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClient } from "./_redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const supplied = (req.query.secret as string | undefined) ?? "";
  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && supplied !== expected) {
    res.status(401).json({ error: "Unauthorized. Check your Admin Secret in Tracking Settings." }); return;
  }
  if (!process.env.REDIS_URL) {
    res.status(503).json({ error: "Tracking not configured. Add REDIS_URL to your Vercel environment variables." }); return;
  }

  try {
    const client = await getClient();
    const ids    = await client.sMembers("ambassador_ids");

    if (ids.length === 0) { await client.disconnect(); res.status(200).json({}); return; }

    // Fetch clicks, orders, profile for every ID in parallel
    const rows = await Promise.all(
      ids.map(async id => {
        const [clicks, orders, profileStr] = await Promise.all([
          client.get(`clicks:${id}`),
          client.get(`orders:${id}`),
          client.get(`profile:${id}`),
        ]);
        return { id, clicks, orders, profileStr };
      })
    );

    await client.disconnect();

    const stats: Record<string, {
      clicks: number; orders: number; email: string | null; registeredName: string | null;
    }> = {};

    for (const { id, clicks, orders, profileStr } of rows) {
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
        orders: parseInt(orders  ?? "0", 10) || 0,
        email,
        registeredName,
      };
    }

    res.status(200).json(stats);
  } catch (err) {
    console.error("Stats error:", err);
    res.status(500).json({ error: "Failed to fetch tracking stats." });
  }
}
