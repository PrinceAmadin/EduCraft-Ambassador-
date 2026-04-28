// api/pending.ts — returns all pending registrations, sorted oldest-first
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getClient } from "./_redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  const supplied = (req.query.secret as string | undefined) ?? "";
  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && supplied !== expected) { res.status(401).json({ error: "Unauthorized." }); return; }
  if (!process.env.REDIS_URL) { res.status(503).json({ error: "Tracking not configured." }); return; }

  try {
    const client = await getClient();
    const ids    = await client.sMembers("pending_ids");

    if (ids.length === 0) { await client.disconnect(); res.status(200).json([]); return; }

    const strs = await Promise.all(ids.map(id => client.get(`pending:${id}`)));
    await client.disconnect();

    const profiles = strs
      .filter(Boolean)
      .map(s => { try { return JSON.parse(s!); } catch { return null; } })
      .filter(Boolean)
      .sort((a, b) => new Date(a.registeredAt).getTime() - new Date(b.registeredAt).getTime());

    res.status(200).json(profiles);
  } catch (err) {
    console.error("Pending error:", err);
    res.status(500).json({ error: "Failed to fetch pending list." });
  }
}
