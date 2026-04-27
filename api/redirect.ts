// api/redirect.ts
// EduCraft Ambassador Redirect — Vercel Serverless Function
// Self-contained: no external imports

import type { VercelRequest, VercelResponse } from "@vercel/node";

// ─── Config ────────────────────────────────────────────────────────────────────
const EDUCRAFT_WHATSAPP = "2347063421088"; // ✏️ EduCraft's official WhatsApp number

// ─── General Ambassador Slots ──────────────────────────────────────────────────
// ✏️ Keep in sync with src/ambassadors.ts
const SLOTS: Record<string, { name: string; school: string; status: "active" | "vacant" }> = {
  "001": { name: "Admins",          school: "Co-founders", status: "active" },
  "002": { name: "Noruwosa Zoe",    school: "UNIBEN",      status: "active" },
  "003": { name: "Cassandra",       school: "DELSU",       status: "active" },
  "004": { name: "Marong",          school: "EUI",         status: "active" },
  "005": { name: "Chidinma",        school: "EUI",         status: "active" },
  "006": { name: "Debby",           school: "EUI",         status: "active" },
  "007": { name: "Osbebo",          school: "EUI",         status: "active" },
  "008": { name: "Ayomidele",       school: "UNIBEN",      status: "active" },
  "009": { name: "Goodness",        school: "EUI",         status: "active" },
  "010": { name: "Ik Nation",       school: "EUI",         status: "active" },
  "011": { name: "Fortune",         school: "EUI",         status: "active" },
  "012": { name: "Obehi",           school: "EUI",         status: "active" },
  "013": { name: "Princewill",      school: "EUI",         status: "active" },
  "014": { name: "Sultan",          school: "EUI",         status: "active" },
  "015": { name: "Taiwo",           school: "EUI",         status: "active" },
  "016": { name: "Aisosa (MLS)",    school: "EUI",         status: "active" },
  "017": { name: "JVS",             school: "EUI",         status: "active" },
  "018": { name: "Dr Abel",         school: "EUI",         status: "active" },
  "019": { name: "",                school: "EUI",         status: "vacant"  },
  "020": { name: "",                school: "EUI",         status: "vacant"  },
  "021": { name: "",                school: "EUI",         status: "vacant"  },
  "022": { name: "Blue Chief",      school: "EUI",         status: "active" },
  "023": { name: "Promzex",         school: "EUI",         status: "active" },
  "024": { name: "Confidence",      school: "EUI",         status: "active" },
  "025": { name: "Fredrick",        school: "EUI",         status: "active" },
  "026": { name: "Esosa",           school: "PG",          status: "active" },
  "027": { name: "David Scholar",   school: "EUI",         status: "active" },
  "028": { name: "Chibuzor",        school: "EUI",         status: "active" },
  "029": { name: "Queen Precious",  school: "EUI",         status: "active" },
  "030": { name: "Cynthia",         school: "EUI",         status: "active" },
  "031": { name: "Miracle",         school: "EUI",         status: "active" },
  "032": { name: "Abdullahi",       school: "EUI",         status: "active" },
  "033": { name: "Gift",            school: "EUI",         status: "active" },
  "034": { name: "Doreen",          school: "EUI",         status: "active" },
  "035": { name: "David Salam",     school: "EUI",         status: "active" },
  "036": { name: "Ayomide Bridget", school: "EUI",         status: "active" },
  "037": { name: "Jekrjk",          school: "UNILAG",      status: "active" },
  "038": { name: "Victory Teshya",  school: "EUI",         status: "active" },
  "039": { name: "Collins",         school: "EUI",         status: "active" },
  "040": { name: "Favour (Favo)",   school: "EUI",         status: "active" },
  "041": { name: "Deborah",         school: "EUI",         status: "active" },
  "042": { name: "Aisosa",          school: "EUI",         status: "active" },
  "043": { name: "Engine Boy",      school: "UNIBEN",      status: "active" },
  "044": { name: "Adenike",         school: "UNIBEN",      status: "active" },
  "045": { name: "Precious",        school: "",            status: "active" },
  "046": { name: "Ayo (Bridget)",   school: "EUI",         status: "active" },
  "047": { name: "Raqeeb (Zenith)", school: "EUI",         status: "active" },
  "048": { name: "Michael",         school: "EUI",         status: "active" },
  "049": { name: "",                school: "EUI",         status: "vacant"  },
  "050": { name: "Joshua (COE)",    school: "EUI",         status: "active" },
  "051": { name: "",                school: "EUI",         status: "vacant"  },
  "052": { name: "",                school: "EUI",         status: "vacant"  },
  "053": { name: "",                school: "EUI",         status: "vacant"  },
  "054": { name: "",                school: "EUI",         status: "vacant"  },
  "055": { name: "",                school: "EUI",         status: "vacant"  },
  "056": { name: "",                school: "EUI",         status: "vacant"  },
  "057": { name: "",                school: "EUI",         status: "vacant"  },
  "058": { name: "",                school: "EUI",         status: "vacant"  },
  "059": { name: "",                school: "EUI",         status: "vacant"  },
  "060": { name: "",                school: "EUI",         status: "vacant"  },
  "061": { name: "",                school: "EUI",         status: "vacant"  },
  "062": { name: "",                school: "EUI",         status: "vacant"  },
  "063": { name: "",                school: "EUI",         status: "vacant"  },
  "064": { name: "",                school: "EUI",         status: "vacant"  },
  "065": { name: "",                school: "EUI",         status: "vacant"  },
  "066": { name: "",                school: "EUI",         status: "vacant"  },
};

// ─── Core Ambassadors (ECCA) ───────────────────────────────────────────────────
// ✏️ Keep in sync with src/ambassadors.ts
const CORE_AMBASSADORS: Record<string, { name: string; school: string }> = {
  "ECCA-001": { name: "Chidinma Victory", school: "EUI" },
  "ECCA-002": { name: "Debby",            school: "EUI" },
  "ECCA-003": { name: "Yole",             school: "EUI" },
  "ECCA-004": { name: "Zoe Grace",        school: "EUI" },
  "ECCA-005": { name: "General",          school: "Admin" },
};

// ─── Sub-Ambassadors (ECSA) ────────────────────────────────────────────────────
// ✏️ Keep in sync with src/ambassadors.ts
const SUB_AMBASSADORS: Record<string, { name: string; school: string; coreId: string }> = {
  "ECSA-001-001": { name: "Rita",     school: "Edwin Clark", coreId: "ECCA-001" },
  "ECSA-001-002": { name: "Praise",   school: "SDU",         coreId: "ECCA-001" },
  "ECSA-001-003": { name: "Queensly", school: "EUI",         coreId: "ECCA-001" },
};

// ─── Handler ──────────────────────────────────────────────────────────────────
export default function handler(req: VercelRequest, res: VercelResponse): void {
  const id   = req.query.id   as string | undefined;
  const type = req.query.type as string | undefined;

  if (!id) {
    res.status(400).send(errorPage("❌ Invalid Link", "No slot ID provided. Use a valid ambassador link."));
    return;
  }

  // ── Route: ECCA (Core Ambassador recruitment link) ─────────────────────────
  if (type === "ecca") {
    const core = CORE_AMBASSADORS[id];
    if (!core) {
      res.status(404).send(errorPage("❌ Not Found", "This Core Ambassador link does not exist."));
      return;
    }
    const message = encodeURIComponent(
      `Hi EduCraft! I was brought in by ${core.name}. I'd love to know more about the EduCraft Ambassadorship Program and how I can be a part of the brand. 🎓`
    );
    res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${message}`);
    return;
  }

  // ── Route: ECSA (Sub-Ambassador client referral link) ──────────────────────
  if (type === "ecsa") {
    const sub  = SUB_AMBASSADORS[id];
    if (!sub) {
      res.status(404).send(errorPage("❌ Not Found", "This Sub-Ambassador link does not exist."));
      return;
    }
    const core    = CORE_AMBASSADORS[sub.coreId];
    const coreName = core ? ` (via ${core.name})` : "";
    const message = encodeURIComponent(
      `Hi EduCraft! I was referred by ${sub.name}${coreName}. I'd like to place an order on the following Services:`
    );
    res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${message}`);
    return;
  }

  // ── Route: General Ambassador client referral link ─────────────────────────
  const slot = SLOTS[id];
  if (!slot) {
    res.status(404).send(errorPage("❌ Not Found", "This ambassador link does not exist. Please contact EduCraft."));
    return;
  }

  if (slot.status === "vacant") {
    const message = encodeURIComponent(`Hi EduCraft! I'd like to place an order on the following Services:`);
    res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${message}`);
    return;
  }

  const message = encodeURIComponent(
    `Hi EduCraft! I was referred by ${slot.name}. I'd like to place an order on the following Services:`
  );
  res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${message}`);
}

// ─── Branded Error Page ───────────────────────────────────────────────────────
function errorPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>EduCraft</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',sans-serif;background:#FFF9ED;
         min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border:2px solid #E0B846;border-radius:16px;
          padding:48px 40px;max-width:420px;text-align:center;
          box-shadow:0 4px 24px rgba(13,87,83,0.10)}
    .icon{font-size:2.5rem;margin-bottom:16px}
    h1{font-size:1.3rem;margin-bottom:12px;color:#ef4444}
    p{color:#0D5753;line-height:1.6;font-size:.95rem}
    .brand{margin-top:24px;font-size:.75rem;color:#12827c;font-weight:700;letter-spacing:.05em}
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🎓</div>
    <h1>${title}</h1>
    <p>${body}</p>
    <div class="brand">EDUCRAFT — Academic & Technical Documentation Experts</div>
  </div>
</body>
</html>`;
}
