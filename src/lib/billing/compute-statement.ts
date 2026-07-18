/**
 * Pure billing-calculation engine (Phase 1 M4). No DB access — every
 * effective-dating/voided/range filter lives here, not in the caller's
 * query, so it's covered by fast tests instead of slow DB-integration
 * ones. The one filter that stays query-level (not this function's job):
 * `meterReadings` must already be `status = 'verified'` only — the schema
 * comment on meter_readings.ts commits to that being enforced by the
 * statement engine's read query.
 *
 * All numeric fields on the input types are plain `number` — callers
 * reading from Supabase (bigint/numeric columns can come back as strings)
 * are responsible for converting before calling this function. Never
 * compare/subtract the raw string values PostgREST returns.
 */

export interface ChargeTypeInput {
  id: string;
  kind: "fixed" | "metered" | "tracked_only" | "one_off";
  name: string;
}

export interface ChargeScheduleInput {
  id: string;
  chargeTypeId: string;
  amount: number | null; // fixed only
  ratePerUnit: number | null; // metered only
  validFrom: string; // "YYYY-MM-DD"
  validTo: string | null;
}

export interface MeterInput {
  id: string;
  chargeTypeId: string;
  label: string;
  baseValue: number;
  installedAt: string; // "YYYY-MM-DD"
  removedAt: string | null;
}

export interface MeterReadingInput {
  id: string;
  meterId: string;
  readingDate: string; // "YYYY-MM-DD"
  createdAt: string; // ISO timestamp, tie-break only
  confirmedValue: number | null; // null treated as "no reading" (see module doc)
}

export interface AdjustmentInput {
  id: string;
  chargeTypeId: string;
  amount: number; // signed
  reason: string;
  targetMonth: string; // "YYYY-MM-01"
  targetMonthEnd: string | null;
  voidedAt: string | null;
}

export interface LineItemInput {
  chargeTypeId: string;
  description: string;
  quantity: number | null;
  unitRate: number | null;
  amount: number;
  isBillable: boolean;
  chargeScheduleId: string | null;
  meterId: string | null;
  fromReadingId: string | null;
  toReadingId: string | null;
  adjustmentId: string | null;
  sortOrder: number;
}

export interface ComputeStatementInput {
  periodMonth: string; // "YYYY-MM-01"
  chargeTypes: ChargeTypeInput[]; // ALL charge_types for the unit, unfiltered by `active`
  chargeSchedules: ChargeScheduleInput[]; // ALL schedules for the tenancy, unfiltered
  meters: MeterInput[]; // ALL meters for the unit, including replaced/removed
  meterReadings: MeterReadingInput[]; // verified only (query-filtered by caller)
  adjustments: AdjustmentInput[]; // ALL adjustments for the tenancy, unfiltered (incl. voided)
}

export interface ComputeStatementResult {
  lineItems: LineItemInput[];
  total: number;
  warnings: string[];
}

/**
 * First day of the month following `periodMonth`. Pure integer math on
 * the parsed "YYYY-MM" parts — never `Date.setMonth()`, which parses as
 * UTC midnight but applies the increment in local time, rolling to the
 * wrong month/day in a negative-offset timezone.
 */
function nextMonthStart(periodMonth: string): string {
  const year = Number(periodMonth.slice(0, 4));
  const month = Number(periodMonth.slice(5, 7));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}

// "YYYY-MM-DD" strings compare chronologically under plain string `<`/`>=`
// (a property of ISO 8601 date formatting) — no Date parsing needed for
// any of the range checks below.

function pickActiveSchedule(
  schedules: ChargeScheduleInput[],
  chargeTypeId: string,
  periodStart: string,
): ChargeScheduleInput | undefined {
  // Whichever schedule covers the *start* of the period governs the whole
  // month — no mid-month proration. The DB's overlap guard means at most
  // one match should exist; `.find()` picks the first if that's ever
  // violated by data this function didn't create itself (e.g. a test
  // fixture).
  return schedules.find(
    (s) => s.chargeTypeId === chargeTypeId && s.validFrom <= periodStart && (s.validTo == null || s.validTo >= periodStart),
  );
}

function latestByReadingDate(readings: MeterReadingInput[]): MeterReadingInput {
  return readings.reduce((latest, r) => {
    if (r.readingDate !== latest.readingDate) return r.readingDate > latest.readingDate ? r : latest;
    return r.createdAt > latest.createdAt ? r : latest;
  });
}

/** The delta anchor: previous verified reading strictly before the period, or the meter's baseValue if none exists at all (not scoped to the current tenancy — see module doc / meters persist across turnover). */
function findFromValue(
  meter: MeterInput,
  readings: MeterReadingInput[],
  periodStart: string,
): { value: number; readingId: string | null } {
  const candidates = readings.filter(
    (r) => r.meterId === meter.id && r.confirmedValue != null && r.readingDate < periodStart,
  );
  if (candidates.length === 0) return { value: meter.baseValue, readingId: null };
  const latest = latestByReadingDate(candidates);
  return { value: latest.confirmedValue as number, readingId: latest.id };
}

/** The reading taken during the period itself, if any — both bounds matter, see module doc on the phantom-zero bug this guards against. */
function findToValue(
  meter: MeterInput,
  readings: MeterReadingInput[],
  periodStart: string,
  nextPeriodStart: string,
): { value: number; readingId: string } | null {
  const candidates = readings.filter(
    (r) =>
      r.meterId === meter.id &&
      r.confirmedValue != null &&
      r.readingDate >= periodStart &&
      r.readingDate < nextPeriodStart,
  );
  if (candidates.length === 0) return null;
  const latest = latestByReadingDate(candidates);
  return { value: latest.confirmedValue as number, readingId: latest.id };
}

export function computeStatement(input: ComputeStatementInput): ComputeStatementResult {
  const { periodMonth, chargeTypes, chargeSchedules, meters, meterReadings, adjustments } = input;
  const periodStart = periodMonth;
  const nextPeriodStart = nextMonthStart(periodMonth);
  const lineItems: LineItemInput[] = [];
  const warnings: string[] = [];
  let sortOrder = 0;

  for (const chargeType of chargeTypes) {
    if (chargeType.kind === "fixed") {
      const schedule = pickActiveSchedule(chargeSchedules, chargeType.id, periodStart);
      if (!schedule) {
        warnings.push(`no active rate for ${chargeType.name} in ${periodMonth}`);
        continue;
      }
      lineItems.push({
        chargeTypeId: chargeType.id,
        description: chargeType.name,
        quantity: null,
        unitRate: null,
        amount: schedule.amount ?? 0,
        isBillable: true,
        chargeScheduleId: schedule.id,
        meterId: null,
        fromReadingId: null,
        toReadingId: null,
        adjustmentId: null,
        sortOrder: sortOrder++,
      });
      continue;
    }

    if (chargeType.kind === "metered" || chargeType.kind === "tracked_only") {
      // Rate resolved once per charge_type, not per meter — a missing rate
      // means nothing under this charge_type is billable this period, one
      // warning, not one per meter.
      let ratePerUnit: number | null = null;
      let rateScheduleId: string | null = null;
      if (chargeType.kind === "metered") {
        const schedule = pickActiveSchedule(chargeSchedules, chargeType.id, periodStart);
        if (!schedule || schedule.ratePerUnit == null) {
          warnings.push(`no active rate for ${chargeType.name} in ${periodMonth}`);
          continue;
        }
        ratePerUnit = schedule.ratePerUnit;
        rateScheduleId = schedule.id;
      }

      const relevantMeters = meters.filter(
        (m) =>
          m.chargeTypeId === chargeType.id &&
          m.installedAt < nextPeriodStart &&
          (m.removedAt == null || m.removedAt >= periodStart),
      );
      for (const meter of relevantMeters) {
        const to = findToValue(meter, meterReadings, periodStart, nextPeriodStart);
        if (!to) {
          warnings.push(`${meter.label} has no reading for ${periodMonth}`);
          continue;
        }
        const from = findFromValue(meter, meterReadings, periodStart);
        const delta = to.value - from.value;
        const description = `${chargeType.name} (${meter.label})`;

        if (chargeType.kind === "tracked_only") {
          lineItems.push({
            chargeTypeId: chargeType.id,
            description,
            quantity: delta,
            unitRate: null,
            amount: 0,
            isBillable: false,
            chargeScheduleId: null,
            meterId: meter.id,
            fromReadingId: from.readingId,
            toReadingId: to.readingId,
            adjustmentId: null,
            sortOrder: sortOrder++,
          });
          continue;
        }

        lineItems.push({
          chargeTypeId: chargeType.id,
          description,
          quantity: delta,
          unitRate: ratePerUnit,
          // Round-per-line, working default — first thing to check if a
          // golden-test total mismatches at M5.
          amount: Math.round(delta * (ratePerUnit as number)),
          isBillable: true,
          chargeScheduleId: rateScheduleId,
          meterId: meter.id,
          fromReadingId: from.readingId,
          toReadingId: to.readingId,
          adjustmentId: null,
          sortOrder: sortOrder++,
        });
      }
      continue;
    }

    // one_off: never gets a charge_schedules row (DB-enforced) — only
    // ever appears via adjustments below, nothing to do here.
  }

  for (const adjustment of adjustments) {
    if (adjustment.voidedAt != null) continue;
    const rangeEnd = adjustment.targetMonthEnd ?? adjustment.targetMonth;
    if (periodMonth < adjustment.targetMonth || periodMonth > rangeEnd) continue;
    lineItems.push({
      chargeTypeId: adjustment.chargeTypeId,
      description: adjustment.reason,
      quantity: null,
      unitRate: null,
      amount: adjustment.amount,
      isBillable: true,
      chargeScheduleId: null,
      meterId: null,
      fromReadingId: null,
      toReadingId: null,
      adjustmentId: adjustment.id,
      sortOrder: sortOrder++,
    });
  }

  const total = lineItems.reduce((sum, li) => sum + li.amount, 0);
  return { lineItems, total, warnings };
}
