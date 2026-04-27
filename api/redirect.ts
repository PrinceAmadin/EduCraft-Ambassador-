// api/redirect.ts
// Vercel Serverless Function — handles /EduCraftA/:id and /a/:id
import type { VercelRequest, VercelResponse } from "@vercel/node";
import ambassadors from "../src/ambassadors";

export default function handler(req: VercelRequest, res: VercelResponse): void {
  const id = req.query.id as string | undefined;

  if (!id) {
    res.status(400).send(renderPage("❌ Invalid Link", "No slot ID was provided.", "#ef4444"));
    return;
  }

  const slot = ambassadors.slots[id];

  if (!slot) {
    res.status(404).send(renderPage("❌ Not Found", `Slot <strong>${id}</strong> does not exist. Contact EduCraft.`, "#ef4444"));
    return;
  }

  if (slot.status === "vacant") {
    res.status(410).send(renderPage("⚠️ Inactive Slot", "This ambassador slot is currently inactive. Please contact EduCraft directly.", "#f59e0b"));
    return;
  }

  const phone   = ambassadors.educraft_whatsapp;
  const message = encodeURIComponent(
    `Hello EduCraft! I was referred by EduCraftA-${id}. I'd like to place an order on the following Services.`
  );

  res.redirect(302, `https://wa.me/${phone}?text=${message}`);
}

function renderPage(title: string, body: string, accent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>EduCraft</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#0f172a;color:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:48px 40px;max-width:420px;text-align:center}
    h1{font-size:1.4rem;margin-bottom:12px;color:${accent}}
    p{color:#94a3b8;line-height:1.6;font-size:.95rem}
    strong{color:#f1f5f9}
  </style>
</head>
<body>
  <div class="card">
    <div style="font-size:2rem;margin-bottom:16px">🎓</div>
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;
}
