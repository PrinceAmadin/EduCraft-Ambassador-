// api/pending.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");

  const supplied = (req.query.secret as string | undefined) ?? "";
  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && supplied !== expected) { res.status(401).json({ error: "Unauthorized." }); return; }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(503).json({ error: "Tracking not configured." }); return; }

  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    const ids = await client.sMembers("pending_ids");
    if (ids.length === 0) { await client.disconnect(); res.status(200).json([]); return; }

    const strs = await Promise.all(ids.map(id => client!.get(`pending:${id}`)));
    await client.disconnect();

    const profiles = strs
      .filter(Boolean)
      .map(s => { try { return JSON.parse(s!); } catch { return null; } })
      .filter(Boolean)
      .sort((a: { registeredAt: string }, b: { registeredAt: string }) =>
        new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime()
      );

    res.status(200).json(profiles);
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("pending error:", err);
    res.status(500).json({ error: "Failed to fetch pending list." });
  }
}
