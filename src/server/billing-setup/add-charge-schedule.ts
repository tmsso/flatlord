"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { BILLING_SETUP_ERRORS, type BillingSetupResult } from "@/lib/billing/charge-presets";
import { planRateChange } from "@/lib/billing/rate-change";

const AddChargeScheduleSchema = z.object({
  tenancyId: z.string().uuid(),
  chargeTypeId: z.string().uuid(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-01$/, "monthRequired"),
  // fixed: whole currency units (bigint); metered: rate per unit (numeric 12,4)
  value: z.number().min(0, "valueInvalid"),
});

// Appends a rate (charge_schedules) for one charge type of a tenancy,
// effective from the 1st of a month, closing the open one the day before
// (rules in lib/billing/rate-change.ts). Never edits an amount or a start
// date: corrections to billed months are adjustments (CLAUDE.md §3.3).
export async function addChargeSchedule(input: z.infer<typeof AddChargeScheduleSchema>): Promise<BillingSetupResult<{ id: string }>> {
  const parsed = AddChargeScheduleSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("id, unit_id")
    .eq("id", parsed.tenancyId)
    .single();
  if (tenancyError) throw new Error(tenancyError.message);

  const { data: chargeType, error: chargeTypeError } = await supabase
    .from("charge_types")
    .select("id, kind, unit_id")
    .eq("id", parsed.chargeTypeId)
    .maybeSingle();
  if (chargeTypeError) throw new Error(chargeTypeError.message);
  if (!chargeType || chargeType.unit_id !== tenancy.unit_id || (chargeType.kind !== "fixed" && chargeType.kind !== "metered")) {
    return { ok: false, error: BILLING_SETUP_ERRORS.notBillable };
  }
  if (chargeType.kind === "fixed" && !Number.isInteger(parsed.value)) {
    return { ok: false, error: BILLING_SETUP_ERRORS.notBillable };
  }

  const [{ data: schedules, error: schedulesError }, { data: lastBilled, error: lastBilledError }] = await Promise.all([
    supabase
      .from("charge_schedules")
      .select("id, valid_from, valid_to")
      .eq("tenancy_id", parsed.tenancyId)
      .eq("charge_type_id", parsed.chargeTypeId),
    supabase
      .from("statements")
      .select("period_month")
      .eq("tenancy_id", parsed.tenancyId)
      .neq("status", "draft")
      .is("voided_at", null)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (schedulesError) throw new Error(schedulesError.message);
  if (lastBilledError) throw new Error(lastBilledError.message);

  const plan = planRateChange(
    parsed.validFrom,
    (schedules ?? []).map((s) => ({ id: s.id, validFrom: s.valid_from, validTo: s.valid_to })),
    lastBilled?.period_month ?? null,
  );
  if (!plan.ok) {
    return { ok: false, error: plan.reason === "periodLocked" ? BILLING_SETUP_ERRORS.periodLocked : BILLING_SETUP_ERRORS.notAfterExisting };
  }

  // Two statements, no transaction across supabase-js calls: close first
  // (the overlap guard would reject the insert otherwise), and re-open the
  // old rate if the insert then fails, so a failure never leaves a gap.
  if (plan.closeScheduleId) {
    const { error: closeError } = await supabase.from("charge_schedules").update({ valid_to: plan.closeOn }).eq("id", plan.closeScheduleId);
    if (closeError) throw new Error(closeError.message);
  }
  const { data: created, error: insertError } = await supabase
    .from("charge_schedules")
    .insert({
      tenancy_id: parsed.tenancyId,
      charge_type_id: parsed.chargeTypeId,
      valid_from: parsed.validFrom,
      amount: chargeType.kind === "fixed" ? parsed.value : null,
      rate_per_unit: chargeType.kind === "metered" ? String(parsed.value) : null,
    })
    .select("id")
    .single();
  if (insertError) {
    if (plan.closeScheduleId) await supabase.from("charge_schedules").update({ valid_to: null }).eq("id", plan.closeScheduleId);
    throw new Error(insertError.message);
  }

  await logAudit(supabase, {
    entityType: "tenancy",
    entityId: parsed.tenancyId,
    actorId: personId,
    action: "charge_schedule_add",
    after: {
      chargeScheduleId: created.id,
      chargeTypeId: parsed.chargeTypeId,
      validFrom: parsed.validFrom,
      value: parsed.value,
      closedScheduleId: plan.closeScheduleId,
      closedOn: plan.closeOn,
    },
  });

  return { ok: true, id: created.id as string };
}
