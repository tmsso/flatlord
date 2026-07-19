import type {
  AdjustmentInput,
  ChargeScheduleInput,
  ChargeTypeInput,
  MeterInput,
  MeterReadingInput,
} from "./compute-statement";
import type { SheetMonth } from "./parse-sheet-months";

export interface ReplayedHistory {
  chargeTypes: ChargeTypeInput[];
  chargeSchedules: ChargeScheduleInput[];
  meters: MeterInput[];
  meterReadings: MeterReadingInput[];
  adjustments: AdjustmentInput[];
}

const FIXED_CODES = ["rent", "common_cost", "internet"] as const;
const METERED_CODES = ["electricity", "gas", "water_bathroom", "water_kitchen"] as const;
const ADJUSTMENT_CODE = "other_adjustment";

function nextMonth(periodMonth: string): string {
  const year = Number(periodMonth.slice(0, 4));
  const month = Number(periodMonth.slice(5, 7));
  const next = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${String(nextYear).padStart(4, "0")}-${String(next).padStart(2, "0")}-01`;
}

/**
 * Collapses a series of (periodMonth, value) points into runs of
 * *adjacent* equal values — deliberately not a group-by-value merge. This
 * tenancy's real rent history has the same rate reappear in two
 * non-contiguous runs (a temporary dip back to the original rate); a
 * group-by-value collapse would wrongly merge those into one schedule
 * spanning the dip.
 *
 * Adjacency means both same value AND consecutive calendar months — not
 * just consecutive array entries. The adjustments caller filters out
 * zero/absent months before collapsing, so two equal-valued adjustment
 * episodes separated by an intervening gap month would otherwise sit
 * array-adjacent and wrongly merge into one continuous run.
 *
 * `openEndLastRun` controls whether the final run gets `validTo: null`.
 * For a `ChargeScheduleInput`, `validTo: null` means open-ended/"still in
 * effect" (compute-statement.ts checks `s.validTo == null || ...`) — right
 * for a rate schedule. For an `AdjustmentInput` it means something
 * different and wrong here: compute-statement.ts computes the inclusive
 * range end as `targetMonthEnd ?? targetMonth`, so `targetMonthEnd: null`
 * collapses the range down to a single month (`targetMonth`) rather than
 * extending it — nulling a genuine multi-month recurring adjustment's
 * final run would silently truncate it back to just its first month.
 * Schedule call sites pass `true`; the adjustments call site passes
 * `false`, so a closed run's `validTo` stays its own true last-covered
 * month instead.
 */
function collapseRuns(points: { periodMonth: string; value: number }[], openEndLastRun: boolean) {
  const runs: { value: number; validFrom: string; validTo: string | null }[] = [];
  for (const point of points) {
    const current = runs[runs.length - 1];
    if (current && current.value === point.value && current.validTo != null && nextMonth(current.validTo) === point.periodMonth) {
      current.validTo = point.periodMonth;
    } else {
      runs.push({ value: point.value, validFrom: point.periodMonth, validTo: point.periodMonth });
    }
  }
  if (openEndLastRun && runs.length > 0) runs[runs.length - 1].validTo = null;
  return runs;
}

export function replaySheetHistory(
  months: SheetMonth[],
  meterBaseValues: Record<(typeof METERED_CODES)[number], number>,
): ReplayedHistory {
  const chargeTypes: ChargeTypeInput[] = [
    ...FIXED_CODES.map((code) => ({ id: code, kind: "fixed" as const, name: code })),
    ...METERED_CODES.map((code) => ({ id: code, kind: "metered" as const, name: code })),
    { id: ADJUSTMENT_CODE, kind: "one_off" as const, name: ADJUSTMENT_CODE },
  ];

  const chargeSchedules: ChargeScheduleInput[] = [];
  for (const code of FIXED_CODES) {
    const points = months
      .map((m) => ({ periodMonth: m.periodMonth, item: m.fixedItems.find((i) => i.code === code) }))
      .filter((p): p is { periodMonth: string; item: { code: string; amount: number } } => p.item != null)
      .map((p) => ({ periodMonth: p.periodMonth, value: p.item.amount }));
    for (const run of collapseRuns(points, true)) {
      chargeSchedules.push({
        id: `${code}-${run.validFrom}`,
        chargeTypeId: code,
        amount: run.value,
        ratePerUnit: null,
        validFrom: run.validFrom,
        validTo: run.validTo,
      });
    }
  }

  const meters: MeterInput[] = [];
  const meterReadings: MeterReadingInput[] = [];
  for (const code of METERED_CODES) {
    const readingsForMeter = months
      .map((m) => ({ periodMonth: m.periodMonth, reading: m.meterReadings.find((r) => r.meterCode === code) }))
      .filter((p): p is { periodMonth: string; reading: { meterCode: string; value: number } } => p.reading != null);

    if (readingsForMeter.length === 0) continue;

    meters.push({
      id: code,
      chargeTypeId: code,
      label: code,
      baseValue: meterBaseValues[code],
      installedAt: readingsForMeter[0].periodMonth,
      removedAt: null,
    });

    // Rate schedule for this meter's charge type — same adjacency-only
    // collapse as the fixed charges above.
    const ratePoints = months
      .map((m) => ({ periodMonth: m.periodMonth, rate: m.meterRates.find((r) => r.meterCode === code) }))
      .filter((p): p is { periodMonth: string; rate: { meterCode: string; rate: number } } => p.rate != null)
      .map((p) => ({ periodMonth: p.periodMonth, value: p.rate.rate }));
    for (const run of collapseRuns(ratePoints, true)) {
      chargeSchedules.push({
        id: `${code}-rate-${run.validFrom}`,
        chargeTypeId: code,
        amount: null,
        ratePerUnit: run.value,
        validFrom: run.validFrom,
        validTo: run.validTo,
      });
    }

    for (const { periodMonth, reading } of readingsForMeter) {
      meterReadings.push({
        id: `${code}-${periodMonth}`,
        meterId: code,
        readingDate: periodMonth,
        createdAt: `${periodMonth}T00:00:00.000Z`,
        confirmedValue: reading.value,
      });
    }
  }

  const adjustmentPoints = months
    .filter((m) => m.adjustments.length > 0)
    .map((m) => ({ periodMonth: m.periodMonth, value: m.adjustments[0].amount, reason: m.adjustments[0].reason }));
  const adjustments: AdjustmentInput[] = collapseRuns(adjustmentPoints, false).map((run, i) => ({
    id: `${ADJUSTMENT_CODE}-${run.validFrom}-${i}`,
    chargeTypeId: ADJUSTMENT_CODE,
    amount: run.value,
    reason: adjustmentPoints.find((p) => p.periodMonth === run.validFrom)?.reason ?? "Other",
    targetMonth: run.validFrom,
    targetMonthEnd: run.validTo,
    voidedAt: null,
  }));

  return { chargeTypes, chargeSchedules, meters, meterReadings, adjustments };
}
