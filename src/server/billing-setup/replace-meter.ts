"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { BILLING_SETUP_ERRORS, type BillingSetupError } from "@/lib/billing/charge-presets";
import { earliestReplacementDate } from "@/lib/billing/meter-replacement";

const ReplaceMeterSchema = z.object({
  meterId: z.string().uuid(),
  replacedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRequired"),
  // The old meter's reading at the swap. Optional only when no tenancy is
  // active on the unit (nobody is billed for that stretch).
  finalValue: z.number().min(0).nullable(),
  newLabel: z.string().trim().min(1, "labelRequired"),
  newBaseValue: z.number().min(0, "baseValueInvalid"),
  // The physical swap date, when the owner had to record a later one
  // (D-46). Audit only.
  actualSwapDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export type ReplaceMeterResult =
  | { ok: true; id: string }
  | { ok: false; error: BillingSetupError; earliestDate?: string };

// B-52: replace a meter in one step — the new meter (linked through
// replaces_meter_id, same charge type), the old meter's verified final
// reading, and its retirement, all on one date. The billing engine then
// bills the change month as (old final − old previous) + (new current −
// new base) with no engine change: each meter is delta'd from its own
// history.
//
// No transaction over supabase-js, so the writes are ordered to fail
// visibly: the new meter goes in first, the old one is retired last. A
// failure in between leaves an extra active meter, which the draft shows
// as "has no reading" — never a charge type with no meter at all, which
// would silently drop the line.
export async function replaceMeter(input: z.infer<typeof ReplaceMeterSchema>): Promise<ReplaceMeterResult> {
  const parsed = ReplaceMeterSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: meter, error: meterError } = await supabase
    .from("meters")
    .select("id, unit_id, charge_type_id, label, base_value, installed_at, removed_at")
    .eq("id", parsed.meterId)
    .single();
  if (meterError) throw new Error(meterError.message);
  if (meter.removed_at) throw new Error("Meter is already retired");

  const [readingsResult, tenanciesResult] = await Promise.all([
    supabase
      .from("meter_readings")
      .select("reading_date, confirmed_value, status")
      .eq("meter_id", meter.id)
      .neq("status", "rejected")
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("tenancies").select("id, status, term_start").eq("unit_id", meter.unit_id),
  ]);
  if (readingsResult.error) throw new Error(readingsResult.error.message);
  if (tenanciesResult.error) throw new Error(tenanciesResult.error.message);
  const readings = readingsResult.data ?? [];
  const tenancies = tenanciesResult.data ?? [];

  let statementMonths: string[] = [];
  if (tenancies.length) {
    const { data: statements, error: statementsError } = await supabase
      .from("statements")
      .select("period_month")
      .in(
        "tenancy_id",
        tenancies.map((t) => t.id),
      )
      .is("voided_at", null);
    if (statementsError) throw new Error(statementsError.message);
    statementMonths = (statements ?? []).map((s) => s.period_month as string);
  }

  const earliest = earliestReplacementDate({
    installedAt: meter.installed_at as string,
    latestReadingDate: (readings[0]?.reading_date as string | undefined) ?? null,
    statementMonths,
  });
  if (parsed.replacedAt < earliest) {
    return { ok: false, error: BILLING_SETUP_ERRORS.replacementMonthBilled, earliestDate: earliest };
  }

  // The active tenancy gets the final reading; a vacant unit needs none.
  const tenancy = tenancies
    .filter((t) => t.status === "active")
    .sort((a, b) => String(b.term_start).localeCompare(String(a.term_start)))[0];
  if (tenancy && parsed.finalValue == null) return { ok: false, error: BILLING_SETUP_ERRORS.finalRequired };

  const lastVerified = readings.find((r) => r.status === "verified" && r.confirmed_value != null);
  const previousValue = Number(lastVerified ? lastVerified.confirmed_value : meter.base_value);
  if (parsed.finalValue != null && parsed.finalValue < previousValue) {
    return { ok: false, error: BILLING_SETUP_ERRORS.finalBelowPrevious };
  }

  // 1. New meter, linked to the old one.
  const { data: newMeter, error: newMeterError } = await supabase
    .from("meters")
    .insert({
      unit_id: meter.unit_id,
      charge_type_id: meter.charge_type_id,
      label: parsed.newLabel,
      base_value: String(parsed.newBaseValue),
      installed_at: parsed.replacedAt,
      replaces_meter_id: meter.id,
    })
    .select("id")
    .single();
  if (newMeterError) throw new Error(newMeterError.message);

  // 2. Old meter's final reading — entered then verified, the same two
  // writes as submit-meter-reading.ts + verify-meter-reading.ts.
  if (tenancy && parsed.finalValue != null) {
    const { data: reading, error: insertError } = await supabase
      .from("meter_readings")
      .insert({
        meter_id: meter.id,
        tenancy_id: tenancy.id,
        reading_date: parsed.replacedAt,
        entered_value: parsed.finalValue,
        entered_by: personId,
        status: "submitted",
        source: "admin",
      })
      .select("id")
      .single();
    if (insertError) throw new Error(insertError.message);
    const { error: verifyError } = await supabase
      .from("meter_readings")
      .update({
        confirmed_value: parsed.finalValue,
        confirmed_by: personId,
        confirmed_at: new Date().toISOString(),
        status: "verified",
      })
      .eq("id", reading.id);
    if (verifyError) throw new Error(verifyError.message);
  }

  // 3. Retire the old meter.
  const { error: retireError } = await supabase.from("meters").update({ removed_at: parsed.replacedAt }).eq("id", meter.id);
  if (retireError) throw new Error(retireError.message);

  await logAudit(supabase, {
    entityType: "property",
    entityId: meter.unit_id,
    actorId: personId,
    action: "meter_replace",
    before: { meterId: meter.id, label: meter.label, removedAt: null },
    after: {
      meterId: meter.id,
      removedAt: parsed.replacedAt,
      finalValue: parsed.finalValue,
      newMeterId: newMeter.id,
      newLabel: parsed.newLabel,
      newBaseValue: parsed.newBaseValue,
      actualSwapDate: parsed.actualSwapDate ?? null,
    },
  });

  return { ok: true, id: newMeter.id as string };
}
