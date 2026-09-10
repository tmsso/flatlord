// Pure decision logic for the daily cron's statement auto-draft pass
// (ROADMAP Phase 4a: "Statement auto-draft on month close when readings
// are verified; one-click issue"). DB-free and separate from the runner
// so every date boundary is unit-tested.
//
// All dates are "YYYY-MM-DD" strings compared with plain string </>=
// (chronological for ISO dates); period months are "YYYY-MM-01".

/**
 * The just-closed calendar month as a "YYYY-MM-01" period key. Run on any
 * day of month M, this returns month M-1 — the month the cron should now
 * be drafting a statement for. Pure integer math on the parsed parts
 * (never Date.setMonth, which mixes UTC parse with local-time arithmetic).
 */
export function previousPeriodMonth(today: string): string {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${String(prevYear).padStart(4, "0")}-${String(prevMonth).padStart(2, "0")}-01`;
}

/** First day of the month after `periodMonth`, as "YYYY-MM-01". */
export function nextPeriodStart(periodMonth: string): string {
  const year = Number(periodMonth.slice(0, 4));
  const month = Number(periodMonth.slice(5, 7));
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
}

/** True when `date` ("YYYY-MM-DD") falls within `periodMonth`. */
export function periodContainsDate(periodMonth: string, date: string): boolean {
  return date >= periodMonth && date < nextPeriodStart(periodMonth);
}

/**
 * Whether a meter was active at any point during `periodMonth` — mirrors
 * compute-statement.ts's `relevantMeters` filter exactly, so the
 * readiness check here and the actual billing use the same notion of
 * "meters that should have a reading this month".
 */
export function isMeterActiveInPeriod(
  installedAt: string,
  removedAt: string | null,
  periodMonth: string,
): boolean {
  return installedAt < nextPeriodStart(periodMonth) && (removedAt == null || removedAt >= periodMonth);
}

// Day-of-month from which the cron will emit a "couldn't draft — readings
// still missing" alert to the owner. Before this day it stays quiet: the
// real workflow has the tenant submitting photos ~5 days before month-end
// and the admin verifying shortly after, so a period is normally ready by
// the 1st–2nd; the buffer avoids nagging on a period that's merely a day
// or two late being verified.
export const AUTO_DRAFT_BLOCKED_GRACE_DAY = 7;

/** True once `today` is on/after AUTO_DRAFT_BLOCKED_GRACE_DAY of its month. */
export function isPastAutoDraftGraceDay(today: string): boolean {
  return Number(today.slice(8, 10)) >= AUTO_DRAFT_BLOCKED_GRACE_DAY;
}

export interface AutoDraftMeter {
  id: string;
  label: string;
  installedAt: string;
  removedAt: string | null;
}

export interface AutoDraftReading {
  meterId: string;
  readingDate: string;
  status: string;
}

export type AutoDraftReadiness =
  | { ready: true }
  | { ready: false; missingMeterLabels: string[] };

/**
 * Decide whether every meter that was active during `periodMonth` has a
 * `verified` reading dated within that month. `ready: false` carries the
 * labels of the meters still missing one, for the blocked-alert body.
 */
export function assessAutoDraftReadiness(
  periodMonth: string,
  meters: AutoDraftMeter[],
  readings: AutoDraftReading[],
): AutoDraftReadiness {
  const active = meters.filter((m) => isMeterActiveInPeriod(m.installedAt, m.removedAt, periodMonth));
  const missingMeterLabels: string[] = [];
  for (const meter of active) {
    const hasVerified = readings.some(
      (r) => r.meterId === meter.id && r.status === "verified" && periodContainsDate(periodMonth, r.readingDate),
    );
    if (!hasVerified) missingMeterLabels.push(meter.label);
  }
  return missingMeterLabels.length === 0 ? { ready: true } : { ready: false, missingMeterLabels };
}
