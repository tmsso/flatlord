// Pure decision logic for the daily cron's lead-time reminders (ROADMAP
// Phase 4 — the four shapes deferred by the first cron batch:
// meter-reading-window, contract-expiry, fixed-charge rate-review, and
// inventory action_by. The fifth deferral — scheduled inventory
// reconfirmation *triggers* — is left out here on purpose: it creates
// campaign rows rather than just notifying, so it's its own piece.)
//
// Kept DB-free and separate from the route handler so every boundary
// condition is covered by fast unit tests. All dates are "YYYY-MM-DD"
// strings compared with plain string </>= (chronological for ISO dates).

export const DEFAULT_METER_READING_LEAD_DAYS = 3;
export const DEFAULT_CONTRACT_EXPIRY_LEAD_DAYS = [60, 30];
export const DEFAULT_RATE_REVIEW_LEAD_DAYS = 30;
export const DEFAULT_INVENTORY_ACTION_BY_LEAD_DAYS = 14;
// PRIVATE.md: the real workflow has the tenant submitting meter photos
// "~5 days before month-end" — day 25 is the default window opening when a
// tenancy hasn't configured meter_reading_config.windowStartDay.
export const DEFAULT_METER_READING_WINDOW_START_DAY = 25;

function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * The one lead value from `leadDaysList` whose "fire day" (targetDate minus
 * that many days) is exactly `today`, or null. Exact-day match, not
 * on-or-after: the cron runs once daily, so this fires each configured
 * lead once (contract expiry uses [60, 30] → two separate reminders).
 */
export function matchedLeadDays(
  targetDate: string,
  leadDaysList: readonly number[],
  today: string,
): number | null {
  for (const lead of leadDaysList) {
    if (!Number.isFinite(lead) || lead < 0) continue;
    if (addDaysUtc(targetDate, -lead) === today) return lead;
  }
  return null;
}

/** Single-lead convenience wrapper around matchedLeadDays. */
export function isLeadReminderDay(targetDate: string, leadDays: number, today: string): boolean {
  return matchedLeadDays(targetDate, [leadDays], today) !== null;
}

function nextMonthPrefix(monthPrefix: string): string {
  const year = Number(monthPrefix.slice(0, 4));
  const month = Number(monthPrefix.slice(5, 7));
  const nm = month === 12 ? 1 : month + 1;
  const ny = month === 12 ? year + 1 : year;
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}`;
}

/**
 * True on the one day a monthly meter-reading nudge should go out:
 * `leadDays` before a reading-window opening (windowStartDay-of-month).
 * Checks both this calendar month's and next month's opening, so a lead
 * that reaches back across a month boundary (e.g. window opens on the
 * 2nd, lead 5 → fires on the 28th of the month before) still matches.
 */
export function isMeterReadingReminderDay(
  windowStartDay: number,
  leadDays: number,
  today: string,
): boolean {
  const clampedDay = Math.min(Math.max(Math.trunc(windowStartDay), 1), 28);
  const dd = String(clampedDay).padStart(2, "0");
  const lead = Math.max(0, Math.trunc(leadDays));
  const thisMonth = `${today.slice(0, 7)}-${dd}`;
  const nextMonth = `${nextMonthPrefix(today.slice(0, 7))}-${dd}`;
  return addDaysUtc(thisMonth, -lead) === today || addDaysUtc(nextMonth, -lead) === today;
}

// --- reminder_lead_days jsonb resolvers ---------------------------------
//
// tenancies.reminder_lead_days shape, extended by this batch from the
// first cron batch's `{ paymentDue?: number }` to:
//   {
//     paymentDue?: number,          // (existing) days before a statement due date
//     meterReading?: number,        // days before the reading window opens
//     contractExpiry?: number[],    // one reminder per entry, before term_end
//     rateReview?: number,          // days before a fixed charge_schedule.valid_to
//     inventoryActionBy?: number,   // days before an inventory action_by_date
//   }
// Every resolver is junk-tolerant: a malformed value must fall back to the
// default, never throw and never silently stop the reminder firing at all.

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function positiveIntOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

export function resolveMeterReadingLeadDays(reminderLeadDays: unknown): number {
  return positiveIntOr(asRecord(reminderLeadDays).meterReading, DEFAULT_METER_READING_LEAD_DAYS);
}

export function resolveContractExpiryLeadDays(reminderLeadDays: unknown): number[] {
  const raw = asRecord(reminderLeadDays).contractExpiry;
  if (Array.isArray(raw)) {
    const cleaned = raw
      .filter((n): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0)
      .map((n) => Math.trunc(n));
    if (cleaned.length > 0) return cleaned;
  }
  return [...DEFAULT_CONTRACT_EXPIRY_LEAD_DAYS];
}

export function resolveRateReviewLeadDays(reminderLeadDays: unknown): number {
  return positiveIntOr(asRecord(reminderLeadDays).rateReview, DEFAULT_RATE_REVIEW_LEAD_DAYS);
}

export function resolveInventoryActionByLeadDays(reminderLeadDays: unknown): number {
  return positiveIntOr(asRecord(reminderLeadDays).inventoryActionBy, DEFAULT_INVENTORY_ACTION_BY_LEAD_DAYS);
}

/** meter_reading_config.windowStartDay (day-of-month), clamped 1..28, default 25. */
export function resolveMeterReadingWindowStartDay(meterReadingConfig: unknown): number {
  const raw = asRecord(meterReadingConfig).windowStartDay;
  const day = typeof raw === "number" && Number.isFinite(raw) ? Math.trunc(raw) : DEFAULT_METER_READING_WINDOW_START_DAY;
  return Math.min(Math.max(day, 1), 28);
}

/** meter_reading_config.frequency — only "monthly" (the default) is supported today. */
export function isMonthlyMeterReading(meterReadingConfig: unknown): boolean {
  const raw = asRecord(meterReadingConfig).frequency;
  return raw == null || raw === "monthly";
}
