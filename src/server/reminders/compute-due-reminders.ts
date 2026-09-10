// Relative (not "@/") import: this module has a DB-free unit test and
// vitest.config.ts resolves no path aliases.
import { isStatementOverdue } from "../../lib/billing/is-statement-overdue";

// Pure decision logic for the daily cron (ROADMAP Phase 4 item 1, scoped
// to payment-due reminders + overdue detection this batch — meter-reading,
// contract-expiry/rent-review, inventory action_by, and scheduled
// reconfirmation triggers are explicitly deferred, see ROADMAP). Kept
// separate from the route handler so it's unit-testable without a DB.

export const DEFAULT_PAYMENT_DUE_LEAD_DAYS = 3;

// tenancies.reminder_lead_days is the first real consumer of this
// previously-unstructured jsonb column (see tenancies.ts's own comment —
// "shape owned by the app layer") — this is where that shape gets defined:
// { paymentDue?: number }. Invalid/missing falls back to the default
// rather than throwing, since a malformed value shouldn't silently stop
// reminders firing at all.
export function resolvePaymentDueLeadDays(reminderLeadDays: unknown): number {
  const raw = (reminderLeadDays as { paymentDue?: unknown } | null)?.paymentDue;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_PAYMENT_DUE_LEAD_DAYS;
}

function addDaysUtc(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// True exactly on the one day this statement's payment-due reminder
// should fire — not "on or after", so the cron (which runs once daily)
// sends it exactly once per statement, not every day from lead-day
// through due-day.
export function isPaymentDueReminderDay(dueDate: string, leadDays: number, today: string): boolean {
  return addDaysUtc(dueDate, -leadDays) === today;
}

export type StatementStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue";

// Delegates to the shared predicate so the cron alert and the UI badge
// (deriveStatementDisplayStatus) can't drift. `issuedAt` is threaded
// through from the cron's statement query: it's what keeps a freshly
// issued retroactive statement from tripping a false overdue alert the
// same day it's issued (see is-statement-overdue.ts).
export function isOverdue(
  status: StatementStatus,
  dueDate: string | null,
  today: string,
  issuedAt: string | null = null,
): boolean {
  return isStatementOverdue({ status, dueDate, issuedAt, today });
}
