// api/stats.ts
// Returns tracking stats (clicks, orders, email) for every ambassador
// that has ever had their link clicked.
// Protected by ADMIN_SECRET query param.

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const supplied       = (req.query.secret as string | undefined) ?? "";
  const expectedSecret = process.env.ADMIN_SECRET ?? "";
  // Only enforce if ADMIN_SECRET is actually set
  if (expectedSecret && supplied !== expectedSecret) {
    res.status(401).json({ error: "Unauthorized. Check your Admin Secret in Tracking Settings." });
    return;
  }

  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;

  if (!url || !token) {
    res.status(503).json({
      error: "Tracking not configured. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to your Vercel environment variables.",
    });
    return;
  }

  // ── 1. Get all ambassador IDs that have ever been tracked ─────────────────
  const setsResp = await fetch(`${url}/smembers/ambassador_ids`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!setsResp.ok) {
    res.status(500).json({ error: "Failed to fetch ambassador list from Redis." });
    return;
  }

  const setsData: { result?: string[] } = await setsResp.json();
  const ambassadorIds = setsData.result ?? [];

  if (ambassadorIds.length === 0) {
    res.status(200).json({});
    return;
  }

  // ── 2. Batch-fetch clicks, orders, profile for every ambassador ───────────
  // Pipeline: for each ID → GET clicks:ID, GET orders:ID, GET profile:ID
  const pipeline = ambassadorIds.flatMap((id) => [
    ["GET", `clicks:${id}`],
    ["GET", `orders:${id}`],
    ["GET", `profile:${id}`],
  ]);

  const pipeResp = await fetch(`${url}/pipeline`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(pipeline),
  });

  if (!pipeResp.ok) {
    res.status(500).json({ error: "Failed to fetch stats data from Redis." });
    return;
  }

  const results: Array<{ result: string | null }> = await pipeResp.json();

  // ── 3. Build response object ──────────────────────────────────────────────
  const stats: Record<
    string,
    { clicks: number; orders: number; email: string | null; registeredName: string | null }
  > = {};

  ambassadorIds.forEach((id, i) => {
    const clicks  = parseInt(results[i * 3]?.result     ?? "0", 10) || 0;
    const orders  = parseInt(results[i * 3 + 1]?.result ?? "0", 10) || 0;
    const profileStr = results[i * 3 + 2]?.result ?? null;

    let email:          string | null = null;
    let registeredName: string | null = null;

    if (profileStr) {
      try {
        const p = JSON.parse(profileStr) as { email?: string; name?: string };
        email          = p.email  ?? null;
        registeredName = p.name   ?? null;
      } catch { /* malformed profile — skip email */ }
    }

    stats[id] = { clicks, orders, email, registeredName };
  });

  res.status(200).json(stats);
}
