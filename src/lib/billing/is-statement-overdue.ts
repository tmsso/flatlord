export type StoredStatementStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue";

/**
 * Grace days a statement issued *on or after* its own nominal due date
 * gets before it counts as overdue.
 *
 * Flatlord bills a month slightly in arrears — "statements are retroactive
 * by design" (admin decision 2026-09-10). A statement for August is issued
 * in early September with a nominal due date of the 5th, i.e. already in
 * the past at the moment it's issued. Without this window every live
 * statement would be "overdue" the instant it's issued: the daily
 * overdue-alert cron would false-fire on it and the tenant portal would
 * render an alarming OVERDUE badge on day one.
 *
 * The grace only applies to genuinely retroactive statements
 * (`issuedDate >= dueDate`). A statement issued *before* its due date
 * becomes overdue exactly at `due_date < today`, unchanged.
 */
export const RETROACTIVE_ISSUE_GRACE_DAYS = 7;

function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Single source of truth for "is this statement overdue". Used by both the
 * display-status derivation (`deriveStatementDisplayStatus`, drives the
 * admin + tenant UI badges) and the daily overdue-alert cron
 * (`compute-due-reminders.isOverdue`), so the two can never drift apart.
 *
 * `today` and `issuedAt` are passed in (never read from the clock here) so
 * this stays a pure, deterministic, unit-testable function. `issuedAt` may
 * be a full ISO timestamp or a "YYYY-MM-DD" date; only the date part is
 * used. When `issuedAt` is null the retroactive grace can't be applied and
 * the rule falls back to the plain `due_date < today` boundary.
 */
export function isStatementOverdue(params: {
  status: StoredStatementStatus;
  dueDate: string | null;
  issuedAt: string | null;
  today: string;
}): boolean {
  const { status, dueDate, issuedAt, today } = params;
  if (status !== "issued" && status !== "partially_paid") return false;
  if (dueDate == null) return false;
  if (today <= dueDate) return false;

  if (issuedAt != null) {
    const issuedDate = issuedAt.slice(0, 10);
    const retroactive = issuedDate >= dueDate;
    if (retroactive && today <= addDaysUtc(issuedDate, RETROACTIVE_ISSUE_GRACE_DAYS)) {
      return false;
    }
  }

  return true;
}
