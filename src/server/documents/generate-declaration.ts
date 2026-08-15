"use server";

import { z } from "zod";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { uploadAttachment } from "@/server/attachments/upload-attachment";
import { DeclarationDocument } from "@/lib/documents/declaration-template";

const GenerateDeclarationSchema = z.object({
  tenancyId: z.string().uuid(),
  occupantPersonId: z.string().uuid(),
});

// One declaration type today — see declaration-content.ts for why
// "accommodation-provider consent" and "address-registration consent"
// (CLAUDE.md §3.6's two examples) collapsed into a single template.
export type DeclarationType = "address_registration_consent";

function personName(p: { given_name: string; family_name: string } | null): string {
  return p ? `${p.given_name} ${p.family_name}` : "—";
}

// Loads the tenancy/property/owner/occupant data, renders the bilingual
// declaration PDF, and persists it via the existing attachments upload
// path (tagged to the tenancy) rather than a bespoke storage flow — this
// is exactly the "generic attachments reused everywhere" component from
// ROADMAP Phase 2 item 4, now exercised by a second producer.
export async function generateDeclaration(input: z.infer<typeof GenerateDeclarationSchema>) {
  const parsed = GenerateDeclarationSchema.parse(input);
  const supabase = await createClient();
  await requireOwnerPersonId(supabase);

  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("id, unit_id, property_id, primary_tenant_id, primary_tenant_registration_type")
    .eq("id", parsed.tenancyId)
    .single();
  if (tenancyError) throw new Error(tenancyError.message);

  const { data: unit, error: unitError } = await supabase
    .from("properties")
    .select("id, parent_id, address_line, hrsz")
    .eq("id", tenancy.unit_id)
    .single();
  if (unitError) throw new Error(unitError.message);

  // Rooms have no address_line of their own (design's inheritance rule,
  // CLAUDE.md §3.2 / properties.ts) — fall back to the parent flat's.
  let addressLine = unit.address_line;
  let hrsz = unit.hrsz;
  if (!addressLine && unit.parent_id) {
    const { data: parent } = await supabase
      .from("properties")
      .select("address_line, hrsz")
      .eq("id", unit.parent_id)
      .single();
    addressLine = parent?.address_line ?? null;
    hrsz = parent?.hrsz ?? hrsz;
  }

  const { data: ownershipRows } = await supabase
    .from("property_ownership")
    .select("persons(given_name, family_name)")
    .eq("property_id", tenancy.property_id);
  type PersonRef = { given_name: string; family_name: string };
  const owners = (ownershipRows ?? []).map((row) => {
    const person = row.persons as unknown as PersonRef | PersonRef[] | null;
    const p = Array.isArray(person) ? person[0] : person;
    return { name: personName(p) };
  });

  const { data: occupantPerson, error: occupantError } = await supabase
    .from("persons")
    .select("given_name, family_name, dob, document_number, citizenship")
    .eq("id", parsed.occupantPersonId)
    .single();
  if (occupantError) throw new Error(occupantError.message);

  let registrationType: string | null = null;
  if (parsed.occupantPersonId === tenancy.primary_tenant_id) {
    registrationType = tenancy.primary_tenant_registration_type;
  } else {
    const { data: occupantRow } = await supabase
      .from("tenancy_occupants")
      .select("registration_type")
      .eq("tenancy_id", parsed.tenancyId)
      .eq("person_id", parsed.occupantPersonId)
      .maybeSingle();
    registrationType = occupantRow?.registration_type ?? null;
  }

  const issueDate = new Date().toISOString().slice(0, 10);

  const buffer = await renderToBuffer(
    DeclarationDocument({
      owners,
      property: { addressLine, hrsz },
      occupant: {
        name: personName(occupantPerson),
        dob: occupantPerson.dob,
        documentNumber: occupantPerson.document_number,
        citizenship: occupantPerson.citizenship,
        registrationType,
      },
      issueDate,
    }),
  );

  const fileName = `address-registration-consent-${issueDate}.pdf`;
  // File's constructor wants a BlobPart; a Node Buffer's ArrayBufferLike
  // backing type isn't structurally assignable to the DOM ArrayBuffer type
  // TypeScript expects here, so wrap it in a plain Uint8Array first (a
  // copy, same defensive-copy idiom as create-contract.ts's bytes.slice()).
  const file = new File([new Uint8Array(buffer)], fileName, { type: "application/pdf" });

  const result = await uploadAttachment(
    {
      entityType: "tenancy",
      entityId: parsed.tenancyId,
      note: `Generated declaration: address-registration / accommodation-provider consent — ${personName(occupantPerson)}`,
    },
    file,
  );

  return result;
}
