"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const AddTenancyOccupantSchema = z.object({
  tenancyId: z.string().uuid(),
  personId: z.string().uuid(),
  relationship: z.string().min(1), // co_occupant | guest (primary is set via tenancies.primary_tenant_id, not here)
  registrationType: z.enum(["main_address", "temporary", "casual", "owner_agent"]).nullable().optional(),
  moveIn: z.string().nullable().optional(),
});

export async function addTenancyOccupant(input: z.infer<typeof AddTenancyOccupantSchema>) {
  const parsed = AddTenancyOccupantSchema.parse(input);
  const supabase = await createClient();
  const { personId: actorPersonId } = await requireOwnerPersonId(supabase);

  const { data, error } = await supabase
    .from("tenancy_occupants")
    .insert({
      tenancy_id: parsed.tenancyId,
      person_id: parsed.personId,
      relationship: parsed.relationship,
      registration_type: parsed.registrationType ?? null,
      move_in: parsed.moveIn ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "tenancy_occupant",
    entityId: data.id,
    actorId: actorPersonId,
    action: "create",
    after: { tenancyId: parsed.tenancyId, personId: parsed.personId, relationship: parsed.relationship, registrationType: parsed.registrationType },
  });

  return { id: data.id as string };
}
