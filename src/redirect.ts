// api/redirect.ts
// EduCraft Ambassador Redirect System — Vercel Serverless Function
// Route: /a/:id  →  WhatsApp redirect with referral message

import type { VercelRequest, VercelResponse } from "@vercel/node";
import ambassadors from "./ambassadors";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  const id = req.query.id as string | undefined;

  // --- No ID provided ---
  if (!id) {
    res.status(400).send(renderPage("❌ Invalid Link", "No slot ID was provided. Please use a valid ambassador link.", "#ef4444"));
    return;
  }

  const slot = ambassadors.slots[id];

  // --- Slot doesn't exist ---
  if (!slot) {
    res.status(404).send(renderPage("❌ Link Not Found", `Ambassador slot <strong>${id}</strong> does not exist. Please contact EduCraft.`, "#ef4444"));
    return;
  }

  // --- Slot is vacant ---
  if (slot.status === "vacant") {
    res.status(410).send(renderPage("⚠️ Inactive Slot", "This ambassador slot is currently inactive. Please contact EduCraft directly.", "#f59e0b"));
    return;
  }

  // --- Valid active slot → build WhatsApp URL and redirect ---
  const phone   = ambassadors.educraft_whatsapp;
  const message = encodeURIComponent(
    `Hello EduCraft! I was referred by EduCraftA-${id}. I'd like to place an order on the following Services.`
  );

  const whatsappURL = `https://wa.me/${phone}?text=${message}`;
  res.redirect(302, whatsappURL);
}

// ─── Helper: Branded error/info page ──────────────────────────────────────────
function renderPage(title: string, body: string, accent: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EduCraft – ${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', sans-serif;
      background: #0f172a;
      color: #f1f5f9;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 48px 40px;
      max-width: 420px;
      text-align: center;
    }
    .dot {
      width: 56px; height: 56px;
      background: ${accent}20;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
      margin: 0 auto 24px;
    }
    h1 { font-size: 1.4rem; margin-bottom: 12px; color: ${accent}; }
    p  { color: #94a3b8; line-height: 1.6; font-size: 0.95rem; }
    strong { color: #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="dot">🎓</div>
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}
