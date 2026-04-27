// data/ambassadors.ts
// ✏️ EDIT THIS FILE to manage your ambassadors
// - Change "status" to "vacant" when someone leaves
// - Update "name" when someone new takes the slot
// - Add new slots by adding new entries to the slots object

export interface AmbassadorSlot {
  name: string;
  status: "active" | "vacant";
}

export interface AmbassadorData {
  educraft_whatsapp: string;
  slots: Record<string, AmbassadorSlot>;
}

const ambassadors: AmbassadorData = {
  // ✏️ Replace with EduCraft's real WhatsApp number (no + sign)
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