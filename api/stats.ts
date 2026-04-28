// api/stats.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");

  const supplied = (req.query.secret as string | undefined) ?? "";
  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && supplied !== expected) {
    res.status(401).json({ error: "Unauthorized. Check your Admin Secret in Tracking Settings." }); return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    res.status(503).json({ error: "Tracking not configured. Add REDIS_URL to your Vercel environment variables." }); return;
  }

  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    const ids = await client.sMembers("ambassador_ids");
    if (ids.length === 0) { await client.disconnect(); res.status(200).json({}); return; }

    const rows = await Promise.all(
      ids.map(async id => {
        const [clicks, orders, profileStr] = await Promise.all([
          client!.get(`clicks:${id}`),
          client!.get(`orders:${id}`),
          client!.get(`profile:${id}`),
        ]);
        return { id, clicks, orders, profileStr };
      })
    );
    await client.disconnect();

    const stats: Record<string, { clicks: number; orders: number; email: string|null; registeredName: string|null }> = {};
    for (const { id, clicks, orders, profileStr } of rows) {
      let email: string|null = null, registeredName: string|null = null;
      if (profileStr) {
        try { const p = JSON.parse(profileStr); email = p.email ?? null; registeredName = p.name ?? null; } catch {}
      }
      stats[id] = { clicks: parseInt(clicks ?? "0") || 0, orders: parseInt(orders ?? "0") || 0, email, registeredName };
    }
    res.status(200).json(stats);
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats. Check your REDIS_URL." });
  }
}
