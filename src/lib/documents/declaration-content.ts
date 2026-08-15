// Bilingual copy for the generated declaration PDF, kept separate from
// the rendering component (src/lib/documents/declaration-template.tsx) so
// the text content is easy to review/edit on its own.
//
// Scope note (ROADMAP Phase 2 item 5): CLAUDE.md §3.6 names two example
// declarations — "accommodation-provider consent" and "address-
// registration consent". In Hungarian residential-letting practice these
// are the same real-world document: the property owner (the "befogadó" /
// accommodation-provider) signs a consent statement ("hozzájáruló
// nyilatkozat") that the tenant's district office ("okmányiroda") requires
// to complete an address registration ("lakcímbejelentés"). Rather than
// ship two templates with duplicated content, this is ONE template
// covering both names — see the PR body for this call-out.
//
// This is NOT a certified legal-form generator. The wording below is a
// reasonable, clearly-structured consent statement, not a verbatim copy
// of an official government form — review the wording before relying on
// it for a real submission.

export type ResidenceKind = "permanent" | "temporary" | "generic";

export function residenceKindFromRegistrationType(
  registrationType: string | null,
): ResidenceKind {
  if (registrationType === "main_address") return "permanent";
  if (registrationType === "temporary") return "temporary";
  return "generic";
}

const RESIDENCE_LABEL: Record<ResidenceKind, { hu: string; en: string }> = {
  permanent: { hu: "bejelentett lakóhely (állandó lakcím)", en: "registered permanent residence" },
  temporary: { hu: "tartózkodási hely", en: "registered temporary residence" },
  generic: { hu: "lakcím", en: "residential address" },
};

export const declarationCopy = {
  title: { hu: "Nyilatkozat lakcímbejelentéshez (befogadói nyilatkozat)", en: "Declaration of Consent for Address Registration (Accommodation-Provider Consent)" },
  aliasNote: {
    hu: "(A dokumentum a lakhatás biztosítójaként, mint “befogadó” tett nyilatkozatot is jelenti.)",
    en: "(This document also serves as the accommodation-provider's consent statement.)",
  },
  ownerSectionTitle: { hu: "A lakás/ház tulajdonosa (befogadó)", en: "Owner of the dwelling (accommodation provider)" },
  propertySectionTitle: { hu: "A lakás/ház címe", en: "Address of the dwelling" },
  occupantSectionTitle: { hu: "A bejelentést tevő személy", en: "Person registering the address" },
  fields: {
    name: { hu: "Név", en: "Name" },
    dob: { hu: "Születési idő", en: "Date of birth" },
    documentNumber: { hu: "Okmány száma", en: "Document number" },
    citizenship: { hu: "Állampolgárság", en: "Citizenship" },
    address: { hu: "Cím", en: "Address" },
    hrsz: { hu: "Helyrajzi szám", en: "Cadastral number (hrsz.)" },
  },
  consentIntro: { hu: "Alulírott, mint a fent megjelölt ingatlan tulajdonosa (befogadó), az alábbiak szerint nyilatkozom:", en: "The undersigned, as owner of the above-named property (accommodation provider), hereby declares:" },
  consentStatement: (residence: ResidenceKind) => ({
    hu: `Hozzájárulok ahhoz, hogy a fent megnevezett személy a fenti ingatlan címén ${RESIDENCE_LABEL[residence].hu}et létesítsen, és ezt a lakcímét az illetékes hatóságnál bejelentse.`,
    en: `I consent to the above-named person establishing their ${RESIDENCE_LABEL[residence].en} at the address of the above property, and to their registering this address with the competent authority.`,
  }),
  dateLabel: { hu: "Kelt", en: "Date" },
  ownerSignatureLabel: { hu: "Tulajdonos (befogadó) aláírása", en: "Owner's (accommodation provider's) signature" },
  occupantSignatureLabel: { hu: "Bejelentést tevő aláírása", en: "Signature of the person registering" },
  generatedNote: {
    hu: "Ez a dokumentum a Flatlord alkalmazásban rögzített adatok alapján, automatikusan készült. Aláírás előtt kérjük ellenőrizze az adatok helyességét.",
    en: "This document was generated automatically from data recorded in the Flatlord app. Please verify the details are correct before signing.",
  },
};
