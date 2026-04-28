// api/register.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST")   { res.status(405).json({ error: "Method not allowed." }); return; }

  const { slotId = "", name = "", school = "", email = "" } = (req.body ?? {}) as Record<string, string>;
  if (!slotId.trim()) { res.status(400).json({ error: "Slot ID is required." }); return; }
  if (!name.trim())   { res.status(400).json({ error: "Full name is required." }); return; }
  if (!email.trim())  { res.status(400).json({ error: "Email address is required." }); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "Please enter a valid email address." }); return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) { res.status(200).json({ success: true, status: "pending", note: "tracking_not_configured" }); return; }

  const id = slotId.trim().toUpperCase();
  let client: ReturnType<typeof createClient> | null = null;
  try {
    client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();

    if (await client.sIsMember("approved_ids", id)) {
      await client.disconnect();
      res.status(409).json({ error: "This Slot ID is already registered and active. Contact EduCraft if you think this is wrong." }); return;
    }
    if (await client.sIsMember("pending_ids", id)) {
      await client.disconnect();
      res.status(409).json({ error: "This Slot ID already has a pending registration awaiting admin approval. Please wait." }); return;
    }

    const profile = { slotId: id, name: name.trim(), school: school.trim(), email: email.trim().toLowerCase(), registeredAt: new Date().toISOString() };
    await client.multi().set(`pending:${id}`, JSON.stringify(profile)).sAdd("pending_ids", id).exec();
    await client.disconnect();
    res.status(200).json({ success: true, status: "pending" });
  } catch (err) {
    try { await client?.disconnect(); } catch {}
    console.error("register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
}
