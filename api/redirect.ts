// api/redirect.ts
// EduCraft Ambassador Redirect — Vercel Serverless Function
// NO external imports — all data lives here so Vercel can run it without issues

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Ambassador Data ──────────────────────────────────────────────────────────
// ✏️ THIS IS THE ONLY SECTION YOU EDIT
// Set status to "vacant" when someone leaves, "active" when someone joins

const EDUCRAFT_WHATSAPP = "2347063421088"; // ← EduCraft's WhatsApp (no + sign)

const SLOTS: Record<string, { name: string; status: "active" | "vacant" }> = {
  "001": { name: "John Doe",    status: "active" },
  "002": { name: "Jane Smith",  status: "active" },
  "003": { name: "Mike Adams",  status: "active" },
  "004": { name: "Sara Obi",    status: "active" },
  "005": { name: "Chidi Nwosu", status: "active" },
  "006": { name: "",            status: "vacant"  },
  "007": { name: "",            status: "vacant"  },
};

// ─── Handler ──────────────────────────────────────────────────────────────────
export default function handler(req: VercelRequest, res: VercelResponse): void {
  const id = req.query.id as string | undefined;

  if (!id) {
    res.status(400).send(page("❌ Invalid Link", "No slot ID provided.", "#ef4444"));
    return;
  }

  const slot = SLOTS[id];

  if (!slot) {
    res.status(404).send(page("❌ Not Found", `Slot <strong>EduCraftA-${id}</strong> does not exist. Contact EduCraft.`, "#ef4444"));
    return;
  }

  if (slot.status === "vacant") {
    res.status(410).send(page("⚠️ Inactive Slot", "This ambassador slot is currently inactive. Please contact EduCraft directly.", "#f59e0b"));
    return;
  }

  const message = encodeURIComponent(
    `Hello EduCraft! I was referred by EduCraftA-${id}. I'd like to place an order on the following Services.`
  );

  res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${message}`);
}

function page(title: string, body: string, accent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>EduCraft</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#0f172a;color:#f1f5f9;
         min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#1e293b;border:1px solid #334155;border-radius:16px;
          padding:48px 40px;max-width:420px;text-align:center}
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
