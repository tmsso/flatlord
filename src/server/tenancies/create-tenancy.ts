"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const CreateTenancySchema = z.object({
  unitId: z.string().uuid(), // a flat or room — never a house (DB check: unit_type_not_house)
  primaryTenantId: z.string().uuid(),
  primaryTenantRegistrationType: z.enum(["main_address", "temporary", "casual", "owner_agent"]).nullable().optional(),
  termStart: z.string().min(1),
  termEnd: z.string().nullable().optional(),
  noticeDays: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(28),
  status: z.enum(["draft", "active", "ended", "terminated"]),
});

export async function createTenancy(input: z.infer<typeof CreateTenancySchema>) {
  const parsed = CreateTenancySchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  // unit_type and property_id are populated by trg_tenancies_validate_unit
  // (migration 0001) from unit_id — never set them from the app, the
  // trigger overwrites unconditionally on INSERT/UPDATE.
  const { data, error } = await supabase
    .from("tenancies")
    .insert({
      unit_id: parsed.unitId,
      primary_tenant_id: parsed.primaryTenantId,
      primary_tenant_registration_type: parsed.primaryTenantRegistrationType ?? null,
      term_start: parsed.termStart,
      term_end: parsed.termEnd ?? null,
      notice_days: parsed.noticeDays,
      due_day: parsed.dueDay,
      status: parsed.status,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "tenancy",
    entityId: data.id,
    actorId: personId,
    action: "create",
    after: { unitId: parsed.unitId, primaryTenantId: parsed.primaryTenantId, termStart: parsed.termStart, status: parsed.status },
  });

  return { id: data.id as string };
}
