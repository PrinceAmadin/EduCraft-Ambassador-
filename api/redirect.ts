// api/redirect.ts — EduCraft Ambassador Redirect
// Uses REDIS_URL (Redis Cloud) for click tracking.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

const EDUCRAFT_WHATSAPP = "2347063421088";

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

const CORE_AMBASSADORS: Record<string, { name: string; school: string }> = {
  "ECCA-001": { name: "Chidinma Victory", school: "EUI" },
  "ECCA-002": { name: "Debby",            school: "EUI" },
  "ECCA-003": { name: "Yole",             school: "EUI" },
  "ECCA-004": { name: "Zoe Grace",        school: "EUI" },
  "ECCA-005": { name: "General",          school: "Admin" },
};

const SUB_AMBASSADORS: Record<string, { name: string; school: string; coreId: string }> = {
  "ECSA-001-001": { name: "Rita",     school: "Edwin Clark", coreId: "ECCA-001" },
  "ECSA-001-002": { name: "Praise",   school: "SDU",         coreId: "ECCA-001" },
  "ECSA-001-003": { name: "Queensly", school: "EUI",         coreId: "ECCA-001" },
};

async function trackClick(ambassadorId: string): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  try {
    const client = createClient({ url: redisUrl });
    client.on("error", () => { /* suppress */ });
    await client.connect();
    await client.multi()
      .incr(`clicks:${ambassadorId}`)
      .sAdd("ambassador_ids", ambassadorId)
      .exec();
    await client.disconnect();
  } catch { /* tracking errors never affect redirects */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id   = req.query.id   as string | undefined;
  const type = req.query.type as string | undefined;

  if (!id) {
    res.status(400).send(errPage("❌ Invalid Link", "No slot ID provided."));
    return;
  }

  if (type === "ecca") {
    const core = CORE_AMBASSADORS[id];
    if (!core) { res.status(404).send(errPage("❌ Not Found", "Core Ambassador link not found.")); return; }
    await trackClick(id);
    res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${encodeURIComponent(`Hi EduCraft! I was brought in by ${core.name}. I'd love to know more about the EduCraft Ambassadorship Program! 🎓`)}`);
    return;
  }

  if (type === "ecsa") {
    const sub = SUB_AMBASSADORS[id];
    if (!sub) { res.status(404).send(errPage("❌ Not Found", "Sub-Ambassador link not found.")); return; }
    await trackClick(id);
    const core = CORE_AMBASSADORS[sub.coreId];
    const via  = core ? ` (via ${core.name})` : "";
    res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${encodeURIComponent(`Hi EduCraft! I was referred by ${sub.name}${via}. I'd like to place an order on the following Services:`)}`);
    return;
  }

  const slot = SLOTS[id];
  if (!slot) { res.status(404).send(errPage("❌ Not Found", "Ambassador link not found.")); return; }
  await trackClick(id);
  const msg = slot.status === "vacant" || !slot.name
    ? "Hi EduCraft! I'd like to place an order on the following Services:"
    : `Hi EduCraft! I was referred by ${slot.name}. I'd like to place an order on the following Services:`;
  res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${encodeURIComponent(msg)}`);
}

function errPage(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>EduCraft</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#FFF9ED;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}.card{background:#fff;border:2px solid #E0B846;border-radius:16px;padding:48px 40px;max-width:420px;text-align:center}.icon{font-size:2.5rem;margin-bottom:16px}h1{font-size:1.3rem;margin-bottom:12px;color:#ef4444}p{color:#0D5753;line-height:1.6}.brand{margin-top:24px;font-size:.75rem;color:#12827c;font-weight:700}</style></head><body><div class="card"><div class="icon">🎓</div><h1>${title}</h1><p>${body}</p><div class="brand">EDUCRAFT</div></div></body></html>`;
}
