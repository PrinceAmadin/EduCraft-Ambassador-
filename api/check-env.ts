// api/check-env.ts — diagnostic endpoint to verify env vars are loaded
// Protected by ADMIN_SECRET. Remove this file after confirming env vars work.
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  const supplied = (req.query.secret as string | undefined) ?? "";
  const expected = process.env.ADMIN_SECRET ?? "";
  if (expected && supplied !== expected) {
    res.status(401).json({ error: "Unauthorized" }); return;
  }
  res.status(200).json({
    REDIS_URL:          process.env.REDIS_URL          ? "SET" : "MISSING",
    GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD ? "SET" : "MISSING",
    ADMIN_SECRET:       process.env.ADMIN_SECRET        ? "SET" : "MISSING",
    NODE_ENV:           process.env.NODE_ENV            ?? "unknown",
    VERCEL_ENV:         process.env.VERCEL_ENV          ?? "unknown",
  });
}
