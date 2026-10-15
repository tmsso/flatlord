"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { BILLING_SETUP_ERRORS, type BillingSetupResult, CHARGE_PRESET_CODES, CUSTOM_CHARGE_KINDS, METER_UNITS, presetFor } from "@/lib/billing/charge-presets";

const CreateChargeTypeSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("preset"), unitId: z.string().uuid(), code: z.enum(CHARGE_PRESET_CODES) }),
  z.object({
    source: z.literal("custom"),
    unitId: z.string().uuid(),
    name: z.string().trim().min(1, "nameRequired"),
    kind: z.enum(CUSTOM_CHARGE_KINDS),
    unit: z.enum(METER_UNITS).nullable(),
  }),
]);

// Adds a charge type to a unit's catalog (charge_types is unit-scoped —
// the reusable list across tenancies; the negotiated amounts live in
// charge_schedules per tenancy). RLS (owner_insert_charge_types, 0008)
// limits it to units the caller owns.
export async function createChargeType(
  input: z.infer<typeof CreateChargeTypeSchema>,
): Promise<BillingSetupResult<{ id: string }>> {
  const parsed = CreateChargeTypeSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  let row: { code: string | null; name: string; kind: string; unit: string | null };
  if (parsed.source === "preset") {
    const preset = presetFor(parsed.code)!;
    // Stored name is a readable fallback in the creator's locale; display
    // goes through the code's catalog entry.
    const t = await getTranslations("statements");
    row = { code: preset.code, name: t(`chargeType.${preset.code}`), kind: preset.kind, unit: preset.unit };

    const { data: existing, error: existingError } = await supabase
      .from("charge_types")
      .select("id")
      .eq("unit_id", parsed.unitId)
      .eq("code", preset.code)
      .eq("active", true)
      .limit(1);
    if (existingError) throw new Error(existingError.message);
    if (existing?.length) return { ok: false, error: BILLING_SETUP_ERRORS.duplicateCode };
  } else {
    const metered = parsed.kind !== "fixed";
    row = { code: null, name: parsed.name, kind: parsed.kind, unit: metered ? (parsed.unit ?? null) : null };
  }

  const { count } = await supabase.from("charge_types").select("id", { count: "exact", head: true }).eq("unit_id", parsed.unitId);

  const { data: created, error } = await supabase
    .from("charge_types")
    .insert({ unit_id: parsed.unitId, ...row, sort_order: count ?? 0 })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // charge_types has no audit scope mapping of its own (0032), so the
  // event is recorded on the unit — visible to its owners.
  await logAudit(supabase, {
    entityType: "property",
    entityId: parsed.unitId,
    actorId: personId,
    action: "charge_type_create",
    after: { chargeTypeId: created.id, ...row },
  });

  return { ok: true, id: created.id as string };
}
