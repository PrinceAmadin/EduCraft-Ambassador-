// api/redirect.ts
// Tracks EVERY click via Redis INCR then immediately redirects.
// Click counter increments on every request ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ even repeated ones from the same person.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "redis";

const EDUCRAFT_WHATSAPP = "2347063421088";

const SLOTS: Record<string, { name: string; school: string; status: "active" | "vacant" }> = {
  "001": { name: "Admins"              , school: "Admin"       , status: "active" },
  "002": { name: "Noruwosa Zoe"        , school: "UNIBEN"      , status: "active" },
  "003": { name: "Cassandra"           , school: "DELSU"       , status: "active" },
  "004": { name: "Marong"              , school: "EUI"         , status: "active" },
  "005": { name: "Chidinma"            , school: "EUI"         , status: "active" },
  "006": { name: "Debby"               , school: "EUI"         , status: "active" },
  "007": { name: "Osheho"              , school: "EUI"         , status: "active" },
  "008": { name: "Ayomidele"           , school: "UNIBEN"      , status: "active" },
  "009": { name: "Goodness"            , school: "EUI"         , status: "active" },
  "010": { name: "Ib Nation"           , school: "EUI"         , status: "active" },
  "011": { name: "Fortune"             , school: "EUI"         , status: "active" },
  "012": { name: "Obehi"               , school: "EUI"         , status: "active" },
  "013": { name: "Princewill"          , school: "EUI"         , status: "active" },
  "014": { name: "Sultan"              , school: "EUI"         , status: "active" },
  "015": { name: "Taiwo"               , school: "EUI"         , status: "active" },
  "016": { name: "Aisosa (MLS)"        , school: "EUI"         , status: "active" },
  "017": { name: "JVS"                 , school: "BRAND"       , status: "active" },
  "018": { name: "Dr Abel"             , school: "EUI"         , status: "active" },
  "019": { name: "Emma"                , school: "EUI"         , status: "active" },
  "020": { name: "Oyewole"             , school: "EUI"         , status: "active" },
  "021": { name: "Blaq"                , school: "EUI"         , status: "active" },
  "022": { name: "Blue Chief"          , school: "EUI"         , status: "active" },
  "023": { name: "Promzex"             , school: "EUI"         , status: "active" },
  "024": { name: "Confidence"          , school: "EUI"         , status: "active" },
  "025": { name: "Fredrick"            , school: "EUI"         , status: "active" },
  "026": { name: "Esosa"               , school: "PG"          , status: "active" },
  "027": { name: "David English"       , school: "EUI"         , status: "active" },
  "028": { name: "Chibuzor"            , school: "EUI"         , status: "active" },
  "029": { name: "Queen Precious"      , school: "EUI"         , status: "active" },
  "030": { name: "Cynthia"             , school: "EUI"         , status: "active" },
  "031": { name: "Miracle"             , school: "EUI"         , status: "active" },
  "032": { name: "Abdullahi"           , school: "EUI"         , status: "active" },
  "033": { name: "Gift"                , school: "EUI"         , status: "active" },
  "034": { name: "Doreen"              , school: "EUI"         , status: "active" },
  "035": { name: "David Salam"         , school: "EUI"         , status: "active" },
  "036": { name: ""                    , school: ""            , status: "vacant" },
  "037": { name: "Ifekristi"           , school: "UNILAG"      , status: "active" },
  "038": { name: "Victory Teshua"      , school: "EUI"         , status: "active" },
  "039": { name: "Collins"             , school: "EUI"         , status: "active" },
  "040": { name: "Favy"                , school: "EUI"         , status: "active" },
  "041": { name: "Deborah"             , school: "EUI"         , status: "active" },
  "042": { name: "Aisosa"              , school: "EUI"         , status: "active" },
  "043": { name: "Engine Boy"          , school: "UNIBEN"      , status: "active" },
  "044": { name: "Adenike"             , school: "UNIBEN"      , status: "active" },
  "045": { name: "Precious"            , school: "EUI"         , status: "active" },
  "046": { name: "Ayo (Bridget)"       , school: "EUI"         , status: "active" },
  "047": { name: "Raqeeb"              , school: "EUI"         , status: "active" },
  "048": { name: "Michael"             , school: "EUI"         , status: "active" },
  "049": { name: "Maro"                , school: "EUI"         , status: "active" },
  "050": { name: "Joshua (COE)"        , school: "EUI"         , status: "active" },
  "051": { name: ""                    , school: ""            , status: "vacant" },
  "052": { name: ""                    , school: ""            , status: "vacant" },
  "053": { name: ""                    , school: "EUI"         , status: "vacant" },
  "054": { name: ""                    , school: "EUI"         , status: "vacant" },
  "055": { name: ""                    , school: "EUI"         , status: "vacant" },
  "056": { name: ""                    , school: "EUI"         , status: "vacant" },
  "057": { name: ""                    , school: "EUI"         , status: "vacant" },
  "058": { name: ""                    , school: "EUI"         , status: "vacant" },
  "059": { name: ""                    , school: "EUI"         , status: "vacant" },
  "060": { name: ""                    , school: "EUI"         , status: "vacant" },
};

const CORE: Record<string, { name: string; school: string }> = {
  "ECCA-001": { name: "Chidinma Victory", school: "EUI" },
  "ECCA-002": { name: "Debby",            school: "EUI" },
  "ECCA-003": { name: "General",             school: "Admin" },
  "ECCA-004": { name: "Zoe Grace",        school: "EUI" },
  "ECCA-005": { name: "Yole",          school: "EUI" },  
  "ECCA-006": { name: "Marong",          school: "EUI" },
};

const SUB: Record<string, { name: string; school: string; coreId: string }> = {
  "ECSA-001-001": { name: "Rita",     school: "Edwin Clark", coreId: "ECCA-001" },
  "ECSA-001-002": { name: "Praise",   school: "SDU",         coreId: "ECCA-001" },
  "ECSA-001-003": { name: "Queensly", school: "EUI",         coreId: "ECCA-001" },
};

// Fire-and-forget click tracking ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ NEVER blocks or throws to the redirect
async function trackClick(id: string): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return;
  try {
    const client = createClient({ url: redisUrl });
    client.on("error", () => {});
    await client.connect();
    // INCR adds 1 every single time this runs ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ every click counts
    await client.multi()
      .incr(`clicks:${id}`)
      .sAdd("ambassador_ids", id)
      .exec();
    await client.disconnect();
  } catch { /* never propagate */ }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const id   = req.query.id   as string | undefined;
  const type = req.query.type as string | undefined;

  if (!id) {
    res.status(400).send(errPage("ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Invalid Link", "No ambassador ID was provided."));
    return;
  }

  // ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ ECCA (Core Ambassador recruitment link) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
  if (type === "ecca") {
    const core = CORE[id];
    if (!core) { res.status(404).send(errPage("ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Not Found", "This Core Ambassador link does not exist.")); return; }
    void trackClick(id); // fire-and-forget
    res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${enc(`Hi EduCraft! I was brought in by ${core.name}. I'd love to know more about the EduCraft Ambassadorship Program and how I can be a part of the brand. ÃÂÃÂ°ÃÂÃÂÃÂÃÂÃÂÃÂ`)}`);
    return;
  }

  // ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ ECSA (Sub-Ambassador client referral link) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
  // URL format: /ECSA/-001-001  ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ  id = "-001-001"
  // Internal key format: "ECSA-001-001" ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ prepend "ECSA" to resolve
  if (type === "ecsa") {
    const fullId = id.startsWith("ECSA") ? id : `ECSA${id}`;
    const sub = SUB[fullId];
    if (!sub) { res.status(404).send(errPage("Not Found", "This Sub-Ambassador link does not exist.")); return; }
    void trackClick(fullId);
    const via = CORE[sub.coreId] ? ` (via ${CORE[sub.coreId].name})` : "";
    res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${enc(`Hi EduCraft! I was referred by ${sub.name}${via}. I'd like to place an order on the following Services:`)}`);
    return;
  }

  // ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ General Ambassador (client referral link) ÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂÃÂÃÂ¢ÃÂÃÂÃÂÃÂ
  const slot = SLOTS[id];

  // Always check Redis first for an approved profile ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ this takes precedence over the static file.
  // Reason: when an ambassador is approved via the application form, they are in Redis but their
  // static slot entry may still show as vacant/unnamed. Redis is the source of truth.
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    try {
      const { createClient } = await import("redis");
      const client = createClient({ url: redisUrl });
      client.on("error", () => {});
      await client.connect();
      const profileStr = await client.get(`profile:${id}`);
      await client.disconnect();
      if (profileStr) {
        const profile = JSON.parse(profileStr) as { name?: string };
        // Only use Redis profile if it has a real name (not vacant)
        if (profile.name && profile.name.trim()) {
          void trackClick(id);
          const msg = `Hi EduCraft! I was referred by ${profile.name}. I'd like to place an order on the following Services:`;
          res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${enc(msg)}`);
          return;
        }
      }
    } catch { /* fall through to static slot */ }
  }

  // No Redis profile ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ use static SLOTS list
  if (!slot) {
    res.status(404).send(errPage("ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Not Found", "This ambassador link does not exist. Please contact EduCraft."));
    return;
  }

  void trackClick(id);
  const msg = slot.status === "vacant" || !slot.name
    ? "Hi EduCraft! I'd like to place an order on the following Services:"
    : `Hi EduCraft! I was referred by ${slot.name}. I'd like to place an order on the following Services:`;
  res.redirect(302, `https://wa.me/${EDUCRAFT_WHATSAPP}?text=${enc(msg)}`);
}

const enc = (s: string) => encodeURIComponent(s);

function errPage(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><title>EduCraft</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',sans-serif;background:#FFF9ED;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border:2px solid #E0B846;border-radius:16px;padding:48px 40px;max-width:420px;text-align:center;box-shadow:0 4px 24px rgba(13,87,83,.10)}
.icon{font-size:2.5rem;margin-bottom:16px}h1{font-size:1.3rem;margin-bottom:12px;color:#ef4444}p{color:#0D5753;line-height:1.6;font-size:.95rem}
.brand{margin-top:24px;font-size:.75rem;color:#12827c;font-weight:700;letter-spacing:.05em}</style></head>
<body><div class="card"><div class="icon">ÃÂÃÂ°ÃÂÃÂÃÂÃÂÃÂÃÂ</div><h1>${title}</h1><p>${body}</p>
<div class="brand">EDUCRAFT ÃÂÃÂ¢ÃÂÃÂÃÂÃÂ Academic &amp; Technical Documentation Experts</div></div></body></html>`;
}
