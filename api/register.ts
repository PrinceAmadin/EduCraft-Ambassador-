// api/register.ts — Ambassador self-registration
// Uses REDIS_URL (Redis Cloud) to store ambassador profiles.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "Method not allowed." }); return; }

  const { slotId, name, school, email } = (req.body ?? {}) as Record<string, string>;

  if (!slotId?.trim())  { res.status(400).json({ error: "Slot ID is required." });       return; }
  if (!name?.trim())    { res.status(400).json({ error: "Full name is required." });      return; }
  if (!email?.trim())   { res.status(400).json({ error: "Email address is required." });  return; }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    // Tracking DB not configured — registration still "succeeds" for the ambassador
    res.status(200).json({ success: true, note: "tracking_not_configured" });
    return;
  }

  const profile = {
    slotId:       slotId.trim().toUpperCase(),
    name:         name.trim(),
    school:       (school ?? "").trim(),
    email:        email.trim().toLowerCase(),
    registeredAt: new Date().toISOString(),
  };

  try {
    const client = createClient({ url: redisUrl });
    client.on("error", () => { /* suppress */ });
    await client.connect();
    await client.multi()
      .set(`profile:${profile.slotId}`, JSON.stringify(profile))
      .sAdd("ambassador_ids", profile.slotId)
      .exec();
    await client.disconnect();
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Redis register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
}
