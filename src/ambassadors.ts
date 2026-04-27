// src/ambassadors.ts
// ✏️ THE FILE YOU EDIT to manage all ambassador data

// ── Types ─────────────────────────────────────────────────────────────────────
export interface AmbassadorSlot {
  name: string;
  school: string;
  status: "active" | "vacant";
}


export interface CoreAmbassador {
  id: string;       // unique ID used to link sub-ambassadors
  name: string;
  school: string;
  percentage: number;
}

export interface SubAmbassador {
  id: string;
  name: string;
  school: string;
  percentage: number;
  coreId: string;   // must match a CoreAmbassador id above
}

export interface AmbassadorData {
  educraft_whatsapp: string;
  slots: Record<string, AmbassadorSlot>;
  coreAmbassadors: CoreAmbassador[];
  subAmbassadors: SubAmbassador[];
}

// ── Data ──────────────────────────────────────────────────────────────────────
const ambassadors: AmbassadorData = {
  educraft_whatsapp: "2347063421088",

  // ── General Ambassador Slots (redirect system) ─────────────────────────────
  slots: {
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
  },

  // ── Core Ambassadors (ECCA) ────────────────────────────────────────────────
  // These are senior partners. Each earns their base % + 3% per sub they have.
  coreAmbassadors: [
    { id: "ECCA-001", name: "Chidinma Victory", school: "EUI",   percentage: 25 },
    { id: "ECCA-002", name: "Debby",            school: "EUI",   percentage: 10 },
    { id: "ECCA-003", name: "Yole",             school: "EUI",   percentage: 10 },
    { id: "ECCA-004", name: "Zoe Grace",        school: "EUI",   percentage: 10 },
    { id: "ECCA-005", name: "General",          school: "Admin", percentage: 10 },
  ],

  // ── Sub-Ambassadors (ECSA) ─────────────────────────────────────────────────
  // Each earns 5% per job. Their coreId links them to a Core Ambassador.
  subAmbassadors: [
    { id: "ECSA-001-001", name: "Rita",     school: "Edwin Clark", percentage: 5, coreId: "ECCA-001" },
    { id: "ECSA-001-002", name: "Praise",   school: "SDU",         percentage: 5, coreId: "ECCA-001" },
    { id: "ECSA-001-003", name: "Queensly", school: "EUI",         percentage: 5, coreId: "ECCA-001" },
  ],
};

export default ambassadors;
