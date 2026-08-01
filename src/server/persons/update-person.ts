"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const UpdatePersonSchema = z.object({
  id: z.string().uuid(),
  givenName: z.string().min(1, "givenNameRequired"),
  familyName: z.string().min(1, "familyNameRequired"),
  documentType: z.enum(["id_card", "passport", "residence_permit"]).nullable().optional(),
  documentNumber: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  birthName: z.string().nullable().optional(),
  birthPlace: z.string().nullable().optional(),
  mothersName: z.string().nullable().optional(),
  citizenship: z.string().nullable().optional(),
  addressCardNumber: z.string().nullable().optional(),
  taxId: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  contactEmail: z.string().email().nullable().optional().or(z.literal("")),
  registeredAddress: z.string().nullable().optional(),
  temporaryAddress: z.string().nullable().optional(),
});

export async function updatePerson(input: z.infer<typeof UpdatePersonSchema>) {
  const parsed = UpdatePersonSchema.parse(input);
  const supabase = await createClient();
  const { personId: actorPersonId } = await requireOwnerPersonId(supabase);

  const { data: before, error: beforeError } = await supabase
    .from("persons")
    .select(
      "given_name, family_name, document_type, document_number, dob, birth_name, birth_place, mothers_name, citizenship, address_card_number, tax_id, phone, contact_email, registered_address, temporary_address",
    )
    .eq("id", parsed.id)
    .single();
  if (beforeError || !before) throw new Error("Person not found");

  const { error } = await supabase
    .from("persons")
    .update({
      given_name: parsed.givenName,
      family_name: parsed.familyName,
      document_type: parsed.documentType ?? null,
      document_number: parsed.documentNumber ?? null,
      dob: parsed.dob ?? null,
      birth_name: parsed.birthName ?? null,
      birth_place: parsed.birthPlace ?? null,
      mothers_name: parsed.mothersName ?? null,
      citizenship: parsed.citizenship ?? null,
      address_card_number: parsed.addressCardNumber ?? null,
      tax_id: parsed.taxId ?? null,
      phone: parsed.phone ?? null,
      contact_email: parsed.contactEmail || null,
      registered_address: parsed.registeredAddress ?? null,
      temporary_address: parsed.temporaryAddress ?? null,
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "person",
    entityId: parsed.id,
    actorId: actorPersonId,
    action: "update",
    before,
    after: { ...parsed },
  });
}
