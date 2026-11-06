// B-13: bilingual copy for the handover-protocol PDF. Self-contained like
// statement-content.ts (rendered outside any next-intl request context);
// every label shows both languages.
export const handoverCopy = {
  title: { move_in: { hu: "Átadás-átvételi jegyzőkönyv — beköltözés", en: "Handover protocol — move-in" }, move_out: { hu: "Átadás-átvételi jegyzőkönyv — kiköltözés", en: "Handover protocol — move-out" } },
  takenAt: { hu: "Felvéve", en: "Recorded" },
  property: { hu: "Ingatlan", en: "Property" },
  tenant: { hu: "Bérlő", en: "Tenant" },
  note: { hu: "Megjegyzés", en: "Note" },
  metersTitle: { hu: "Mérőórák", en: "Meters" },
  meter: { hu: "Mérő", en: "Meter" },
  value: { hu: "Állás", en: "Reading" },
  date: { hu: "Dátum", en: "Date" },
  baseValue: { hu: "kezdő érték", en: "base value" },
  inventoryTitle: { hu: "Leltár", en: "Inventory" },
  item: { hu: "Tétel", en: "Item" },
  condition: { hu: "Állapot", en: "Condition" },
  ownedBy: { hu: "Tulajdonos", en: "Owned by" },
  photos: { hu: "Fotók", en: "Photos" },
  owned: { owner: { hu: "bérbeadó", en: "owner" }, renter: { hu: "bérlő", en: "renter" }, conditional: { hu: "feltételes", en: "conditional" } } as Record<string, { hu: string; en: string }>,
  none: { hu: "nincs", en: "none" },
  signatureOwner: { hu: "Bérbeadó", en: "Landlord" },
  signatureTenant: { hu: "Bérlő", en: "Tenant" },
  footer: { hu: "A jegyzőkönyv a felvétel pillanatának állapotát rögzíti; utólag nem módosítható.", en: "This protocol records the state at the time it was taken; it cannot be changed afterwards." },
} as const;
