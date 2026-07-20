import type { StatementDisplayStatus } from "@/components/status-badge";

export type StoredStatementStatus = "draft" | "issued" | "partially_paid" | "paid" | "overdue";

/**
 * `overdue` is never stored — statements.ts's own schema comment commits
 * to deriving it: status IN (issued, partially_paid) AND due_date < today.
 * `today` is passed in (not read from `Date.now()` internally) so this
 * stays a pure, deterministic, unit-testable function.
 */
export function deriveStatementDisplayStatus(
  status: StoredStatementStatus,
  dueDate: string | null,
  today: string,
): StatementDisplayStatus {
  if ((status === "issued" || status === "partially_paid") && dueDate != null && dueDate < today) {
    return "overdue";
  }
  return status;
}
