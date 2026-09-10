import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeStatement,
  type AdjustmentInput,
  type ChargeScheduleInput,
  type ChargeTypeInput,
  type MeterInput,
  type MeterReadingInput,
} from "@/lib/billing/compute-statement";

export interface CreateDraftStatementInput {
  tenancyId: string;
  periodMonth: string; // "YYYY-MM-01"
}

export interface CreateDraftStatementResult {
  statementId: string;
  warnings: string[];
}

// The client-injectable core of create-draft-statement.ts. Split out so
// the daily cron's auto-draft pass (ROADMAP Phase 4a) can run the exact
// same compute + insert with a service-role client, while the "use
// server" action keeps calling it with the RLS/cookie client — mirrors
// how notify-*.ts is shaped. No auth check of its own: the action relies
// on RLS (owner_insert_statements / owner_insert_charge_types etc.), the
// cron relies on the service-role client bypassing RLS entirely.
//
// Known gap, deliberately deferred (unchanged from the original): the
// statement insert and the line-item insert are two calls, not one
// transaction — a failure between them orphans a draft with zero line
// items, and there's no delete/regenerate-draft action in this
// milestone, so the (tenancy_id, period_month) unique constraint would
// then permanently wedge that period.
export async function createDraftStatementCore(
  supabase: SupabaseClient,
  input: CreateDraftStatementInput,
): Promise<CreateDraftStatementResult> {
  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("id, unit_id")
    .eq("id", input.tenancyId)
    .single();
  if (tenancyError) throw new Error(tenancyError.message);

  // All queries below are deliberately unfiltered (beyond scoping to this
  // unit/tenancy) — computeStatement owns every effective-dating/voided/
  // active filter itself. The one exception is status='verified' on
  // meter_readings, which the schema's own comment commits to being a
  // query-level filter. meter_readings is scoped by meterId, not
  // tenancyId, on purpose: a reading from a prior tenancy's occupancy of
  // the same physical meter must still surface as the correct `from`
  // anchor for a delta spanning tenancy turnover.
  const { data: chargeTypeRows, error: chargeTypesError } = await supabase
    .from("charge_types")
    .select("id, kind, name")
    .eq("unit_id", tenancy.unit_id);
  if (chargeTypesError) throw new Error(chargeTypesError.message);

  const { data: chargeScheduleRows, error: chargeSchedulesError } = await supabase
    .from("charge_schedules")
    .select("id, charge_type_id, amount, rate_per_unit, valid_from, valid_to")
    .eq("tenancy_id", input.tenancyId);
  if (chargeSchedulesError) throw new Error(chargeSchedulesError.message);

  const { data: meterRows, error: metersError } = await supabase
    .from("meters")
    .select("id, charge_type_id, label, base_value, installed_at, removed_at")
    .eq("unit_id", tenancy.unit_id);
  if (metersError) throw new Error(metersError.message);

  const meterIds = (meterRows ?? []).map((m) => m.id as string);
  const { data: readingRows, error: readingsError } = meterIds.length
    ? await supabase
        .from("meter_readings")
        .select("id, meter_id, reading_date, created_at, confirmed_value")
        .in("meter_id", meterIds)
        .eq("status", "verified")
    : { data: [], error: null };
  if (readingsError) throw new Error(readingsError.message);

  const { data: adjustmentRows, error: adjustmentsError } = await supabase
    .from("adjustments")
    .select("id, charge_type_id, amount, reason, target_month, target_month_end, voided_at")
    .eq("tenancy_id", input.tenancyId);
  if (adjustmentsError) throw new Error(adjustmentsError.message);

  // Raw query results carry bigint/numeric columns that PostgREST can
  // return as strings — convert to plain numbers here, once, before
  // handing off to the pure function (which assumes clean `number`s).
  const chargeTypes: ChargeTypeInput[] = (chargeTypeRows ?? []).map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
  }));
  const chargeSchedules: ChargeScheduleInput[] = (chargeScheduleRows ?? []).map((r) => ({
    id: r.id,
    chargeTypeId: r.charge_type_id,
    amount: r.amount == null ? null : Number(r.amount),
    ratePerUnit: r.rate_per_unit == null ? null : Number(r.rate_per_unit),
    validFrom: r.valid_from,
    validTo: r.valid_to,
  }));
  const meters: MeterInput[] = (meterRows ?? []).map((r) => ({
    id: r.id,
    chargeTypeId: r.charge_type_id,
    label: r.label,
    baseValue: Number(r.base_value),
    installedAt: r.installed_at,
    removedAt: r.removed_at,
  }));
  const meterReadings: MeterReadingInput[] = (readingRows ?? []).map((r) => ({
    id: r.id,
    meterId: r.meter_id,
    readingDate: r.reading_date,
    createdAt: r.created_at,
    confirmedValue: r.confirmed_value == null ? null : Number(r.confirmed_value),
  }));
  const adjustments: AdjustmentInput[] = (adjustmentRows ?? []).map((r) => ({
    id: r.id,
    chargeTypeId: r.charge_type_id,
    amount: Number(r.amount),
    reason: r.reason,
    targetMonth: r.target_month,
    targetMonthEnd: r.target_month_end,
    voidedAt: r.voided_at,
  }));

  const result = computeStatement({
    periodMonth: input.periodMonth,
    chargeTypes,
    chargeSchedules,
    meters,
    meterReadings,
    adjustments,
  });

  // The (tenancy_id, period_month) unique constraint naturally rejects a
  // duplicate draft here — let it surface as the standard thrown-Error
  // path, no pre-check needed.
  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .insert({
      tenancy_id: input.tenancyId,
      period_month: input.periodMonth,
      status: "draft",
      total: result.total,
    })
    .select("id")
    .single();
  if (statementError) throw new Error(statementError.message);

  if (result.lineItems.length > 0) {
    const { error: lineItemsError } = await supabase.from("statement_line_items").insert(
      result.lineItems.map((li) => ({
        statement_id: statement.id,
        charge_type_id: li.chargeTypeId,
        description: li.description,
        quantity: li.quantity,
        unit_rate: li.unitRate,
        amount: li.amount,
        is_billable: li.isBillable,
        charge_schedule_id: li.chargeScheduleId,
        meter_id: li.meterId,
        from_reading_id: li.fromReadingId,
        to_reading_id: li.toReadingId,
        adjustment_id: li.adjustmentId,
        sort_order: li.sortOrder,
      })),
    );
    if (lineItemsError) throw new Error(lineItemsError.message);
  }

  return { statementId: statement.id as string, warnings: result.warnings };
}
