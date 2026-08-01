"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const CreatePersonSchema = z.object({
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

export async function createPerson(input: z.infer<typeof CreatePersonSchema>) {
  const parsed = CreatePersonSchema.parse(input);
  const supabase = await createClient();
  const { personId: actorPersonId } = await requireOwnerPersonId(supabase);

  const { data, error } = await supabase
    .from("persons")
    .insert({
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
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "person",
    entityId: data.id,
    actorId: actorPersonId,
    action: "create",
    after: { ...parsed },
  });

  return { id: data.id as string };
}
