// src/ambassadors.ts
// ✏️ THE ONLY FILE YOU EVER NEED TO EDIT
// - Set status to "vacant" when an ambassador leaves
// - Update name when someone new takes the slot
// - Add new entries to add more slots

export interface AmbassadorSlot {
  name: string;
  status: "active" | "vacant";
}

export interface AmbassadorData {
  educraft_whatsapp: string;
  slots: Record<string, AmbassadorSlot>;
}

const ambassadors: AmbassadorData = {
  // ✏️ EduCraft's WhatsApp number — no + sign, include country code
  educraft_whatsapp: "2347063421088",

  slots: {
    "001": { name: "John Doe",    status: "active" },
    "002": { name: "Jane Smith",  status: "active" },
    "003": { name: "Mike Adams",  status: "active" },
    "004": { name: "Sara Obi",    status: "active" },
    "005": { name: "Chidi Nwosu", status: "active" },
    "006": { name: "",            status: "vacant"  },
    "007": { name: "",            status: "vacant"  },
  },
};

export default ambassadors;
