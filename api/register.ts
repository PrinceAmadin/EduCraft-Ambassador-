// api/register.ts
// Ambassador self-registration endpoint.
// Saves ambassador profile (name, school, email, slotId) to Upstash Redis
// so the tracking system can send them email notifications on orders.

import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // CORS — needed so the /register page (same origin) can POST here
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST")    { res.status(405).json({ error: "Method not allowed." }); return; }

  const { slotId, name, school, email } = (req.body ?? {}) as Record<string, string>;

  // ── Validation ────────────────────────────────────────────────────────────
  if (!slotId?.trim())  { res.status(400).json({ error: "Slot ID is required." });      return; }
  if (!name?.trim())    { res.status(400).json({ error: "Full name is required." });    return; }
  if (!email?.trim())   { res.status(400).json({ error: "Email address is required." }); return; }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  const { UPSTASH_REDIS_REST_URL: url, UPSTASH_REDIS_REST_TOKEN: token } = process.env;

  if (!url || !token) {
    // Tracking DB not yet configured — register still "succeeds" from the
    // ambassador's perspective; admin can set up env vars later.
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

  const pipeResp = await fetch(`${url}/pipeline`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify([
      // Store full profile as JSON string keyed by slotId
      ["SET", `profile:${profile.slotId}`, JSON.stringify(profile)],
      // Ensure this slotId is in the global ambassador_ids set (for stats lookup)
      ["SADD", "ambassador_ids", profile.slotId],
    ]),
  });

  if (!pipeResp.ok) {
    res.status(500).json({ error: "Registration failed. Please try again." });
    return;
  }

  res.status(200).json({ success: true });
}
