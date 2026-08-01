"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const AddPropertyOwnerSchema = z.object({
  propertyId: z.string().uuid(), // must be a root property (house or top-level flat)
  personId: z.string().uuid(),
  percentage: z.number().gt(0).lte(100),
});

export async function addPropertyOwner(input: z.infer<typeof AddPropertyOwnerSchema>) {
  const parsed = AddPropertyOwnerSchema.parse(input);
  const supabase = await createClient();
  const { personId: actorPersonId } = await requireOwnerPersonId(supabase);

  const { error } = await supabase.from("property_ownership").insert({
    property_id: parsed.propertyId,
    person_id: parsed.personId,
    percentage: String(parsed.percentage),
  });
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "property_ownership",
    entityId: parsed.propertyId,
    actorId: actorPersonId,
    action: "create",
    after: { personId: parsed.personId, percentage: parsed.percentage },
  });
}
