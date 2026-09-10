// Pure decision logic for the daily cron's scheduled inventory-
// reconfirmation trigger (ROADMAP Phase 4a — the last deferred cron shape;
// deferred from the lead-reminder batch because it *creates* campaign
// rows, not just notifications). DB-free and separate from the runner so
// every boundary is unit-tested.
//
// Config lives under tenancies.reminder_lead_days.reconfirmation — the
// same "app owns the jsonb shape" idiom the lead-reminder batch used to
// extend that column, so no migration. Shape:
//   reconfirmation?: {
//     intervalMonths: number,  // >= 1; how often a campaign should recur
//     monthDay?: number,       // 1..28 day-of-month to fire on (default 1)
//     dueDays?: number,        // days the tenant gets to respond (default 30)
//   }
// ABSENT OR INVALID => disabled. The feature is strictly opt-in per
// tenancy: a scheduled campaign hands the real tenant a task list, so it
// must never start firing as a side effect of anything — only an explicit
// config value turns it on.

export const DEFAULT_RECONFIRMATION_MONTH_DAY = 1;
export const DEFAULT_RECONFIRMATION_DUE_DAYS = 30;

export interface ReconfirmationSchedule {
  intervalMonths: number;
  monthDay: number;
  dueDays: number;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function positiveIntOr(value: unknown, fallback: number, min: number, max?: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const n = Math.trunc(value);
  if (n < min) return fallback;
  return max != null ? Math.min(n, max) : n;
}

/** Parse the schedule config, or null when disabled/malformed. */
export function resolveReconfirmationSchedule(reminderLeadDays: unknown): ReconfirmationSchedule | null {
  const raw = asRecord(asRecord(reminderLeadDays).reconfirmation);
  const interval = raw.intervalMonths;
  if (typeof interval !== "number" || !Number.isFinite(interval) || Math.trunc(interval) < 1) return null;

  return {
    intervalMonths: Math.trunc(interval),
    monthDay: positiveIntOr(raw.monthDay, DEFAULT_RECONFIRMATION_MONTH_DAY, 1, 28),
    dueDays: positiveIntOr(raw.dueDays, DEFAULT_RECONFIRMATION_DUE_DAYS, 1),
  };
}

/** Add whole months to a "YYYY-MM-DD" date; returns the first of the target month ("YYYY-MM-01"). */
export function addMonthsUtc(dateStr: string, months: number): string {
  const year = Number(dateStr.slice(0, 4));
  const month = Number(dateStr.slice(5, 7)); // 1-based
  const totalM = year * 12 + (month - 1) + months;
  const ny = Math.floor(totalM / 12);
  const nm = (totalM % 12) + 1;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-01`;
}

/** `dateStr` ("YYYY-MM-DD") plus `days`. */
export function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The "YYYY-MM-DD" of `monthDay` in the same month as `dateStr`. */
function withMonthDay(dateStr: string, monthDay: number): string {
  return `${dateStr.slice(0, 7)}-${String(monthDay).padStart(2, "0")}`;
}

function firstMonthDayOnOrAfter(dateStr: string, monthDay: number): string {
  const inThisMonth = withMonthDay(dateStr, monthDay);
  return inThisMonth >= dateStr ? inThisMonth : withMonthDay(addMonthsUtc(dateStr, 1), monthDay);
}

/**
 * The date the next scheduled campaign is due to be created.
 *  - never run before → the next `monthDay` on/after `today`, so a
 *    freshly-configured schedule first fires on its chosen day rather than
 *    the instant the cron next runs.
 *  - run before → `monthDay` of the month `intervalMonths` after the last
 *    campaign's start date (auto *or* manual — a manual campaign resets
 *    the clock on purpose).
 */
export function nextScheduledReconfirmationDate(
  lastInitiatedDate: string | null,
  schedule: ReconfirmationSchedule,
  today: string,
): string {
  if (lastInitiatedDate == null) return firstMonthDayOnOrAfter(today, schedule.monthDay);
  return withMonthDay(addMonthsUtc(lastInitiatedDate.slice(0, 10), schedule.intervalMonths), schedule.monthDay);
}

/** True once a scheduled campaign is due (today is on/after the next scheduled date). */
export function isReconfirmationDueDay(
  lastInitiatedDate: string | null,
  schedule: ReconfirmationSchedule,
  today: string,
): boolean {
  return today >= nextScheduledReconfirmationDate(lastInitiatedDate, schedule, today);
}
