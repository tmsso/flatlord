"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { BILLING_SETUP_ERRORS, type BillingSetupResult } from "@/lib/billing/charge-presets";

const CreateMeterSchema = z.object({
  unitId: z.string().uuid(),
  chargeTypeId: z.string().uuid(),
  label: z.string().trim().min(1, "labelRequired"),
  baseValue: z.number().min(0, "baseValueInvalid"),
  installedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRequired"),
});

// A meter on a unit, billed against one of the unit's metered (or
// tracked_only) charge types. base_value is the reading at installation —
// the first delta's "from" (CLAUDE.md §3.4). 0008's trigger rejects a
// fixed/one_off charge type; the explicit check here gives a clean error.
export async function createMeter(input: z.infer<typeof CreateMeterSchema>): Promise<BillingSetupResult<{ id: string }>> {
  const parsed = CreateMeterSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: chargeType, error: chargeTypeError } = await supabase
    .from("charge_types")
    .select("id, kind, unit_id")
    .eq("id", parsed.chargeTypeId)
    .maybeSingle();
  if (chargeTypeError) throw new Error(chargeTypeError.message);
  if (!chargeType || chargeType.unit_id !== parsed.unitId || (chargeType.kind !== "metered" && chargeType.kind !== "tracked_only")) {
    return { ok: false, error: BILLING_SETUP_ERRORS.notMeterable };
  }

  const { data: meter, error } = await supabase
    .from("meters")
    .insert({
      unit_id: parsed.unitId,
      charge_type_id: parsed.chargeTypeId,
      label: parsed.label,
      base_value: String(parsed.baseValue),
      installed_at: parsed.installedAt,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "property",
    entityId: parsed.unitId,
    actorId: personId,
    action: "meter_create",
    after: { meterId: meter.id, chargeTypeId: parsed.chargeTypeId, label: parsed.label, baseValue: parsed.baseValue, installedAt: parsed.installedAt },
  });

  return { ok: true, id: meter.id as string };
}
