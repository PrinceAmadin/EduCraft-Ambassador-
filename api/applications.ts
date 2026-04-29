// api/applications.ts — returns all pending ambassador applications (admin only)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

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

    const ids    = await client.sMembers("application_ids");
    if (ids.length === 0) { await client.disconnect(); res.status(200).json([]); return; }

    const strs = await Promise.all(ids.map(id => client!.get(`application:${id}`)));
    await client.disconnect();

    const apps = strs
      .filter(Boolean)
      .map(s => { try { return JSON.parse(s!); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

    res.status(200).json(apps);
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    res.status(500).json({ error: "Failed to fetch applications." });
  }
}
