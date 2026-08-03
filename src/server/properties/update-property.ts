"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

// type/parentId are not editable post-creation — changing them would
// require re-deriving root_property_id for the whole subtree and
// re-checking the letting-mode invariant across siblings, out of scope
// for this pass. Re-parenting, if ever needed, is a delete+recreate.
const UpdatePropertySchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1, "nameRequired"),
  addressLine: z.string().nullable().optional(),
  hrsz: z.string().nullable().optional(),
  paymentInstructions: z.string().nullable().optional(),
  lettingMode: z.enum(["whole", "by_room"]).nullable().optional(),
  active: z.boolean(),
});

export async function updateProperty(input: z.infer<typeof UpdatePropertySchema>) {
  const parsed = UpdatePropertySchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: before, error: beforeError } = await supabase
    .from("properties")
    .select("name, address_line, hrsz, payment_instructions, letting_mode, active")
    .eq("id", parsed.id)
    .single();
  if (beforeError || !before) throw new Error("Property not found");

  const { error } = await supabase
    .from("properties")
    .update({
      name: parsed.name,
      address_line: parsed.addressLine ?? null,
      hrsz: parsed.hrsz ?? null,
      payment_instructions: parsed.paymentInstructions ?? null,
      letting_mode: parsed.lettingMode ?? null,
      active: parsed.active,
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "property",
    entityId: parsed.id,
    actorId: personId,
    action: "update",
    before,
    after: {
      name: parsed.name,
      address_line: parsed.addressLine,
      hrsz: parsed.hrsz,
      payment_instructions: parsed.paymentInstructions,
      letting_mode: parsed.lettingMode,
      active: parsed.active,
    },
  });
}
