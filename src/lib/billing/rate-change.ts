// Pure rules for appending a new effective-dated rate (charge_schedules)
// — kept DB-free so they're unit-testable. The engine is month-granular:
// the schedule covering the 1st of a month governs that whole month
// (compute-statement.ts pickActiveSchedule), and treats valid_to as
// inclusive. So a new rate starts on a 1st, and the rate before it closes
// on the last day of the previous month — no overlap under the DB's [)
// overlap guard either.

export interface ExistingSchedule {
  id: string;
  validFrom: string;
  validTo: string | null;
}

export type RateChangePlan =
  | { ok: true; closeScheduleId: string | null; closeOn: string | null }
  | { ok: false; reason: "notAfterExisting" | "periodLocked" };

export function lastDayOfPreviousMonth(monthStart: string): string {
  const d = new Date(`${monthStart}T00:00:00Z`);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}

/**
 * @param validFrom "YYYY-MM-01"
 * @param lastBilledPeriod the latest period_month with an issued (non-draft,
 *   non-voided) statement on this tenancy, or null. Billed months are
 *   immutable (CLAUDE.md §3.3), so a rate may only start after it.
 */
export function planRateChange(validFrom: string, existing: ExistingSchedule[], lastBilledPeriod: string | null): RateChangePlan {
  if (lastBilledPeriod && validFrom <= lastBilledPeriod) return { ok: false, reason: "periodLocked" };
  // Append-only: never insert before or between existing rates — history
  // is changed by adjustments, not by rewriting schedules.
  if (existing.some((s) => s.validFrom >= validFrom)) return { ok: false, reason: "notAfterExisting" };
  const open = existing.find((s) => s.validTo == null);
  if (open) return { ok: true, closeScheduleId: open.id, closeOn: lastDayOfPreviousMonth(validFrom) };
  // A closed latest rate that runs into the new one would overlap.
  if (existing.some((s) => s.validTo != null && s.validTo >= validFrom)) return { ok: false, reason: "notAfterExisting" };
  return { ok: true, closeScheduleId: null, closeOn: null };
}
