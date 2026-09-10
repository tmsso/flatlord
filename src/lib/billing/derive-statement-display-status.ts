import type { StatementDisplayStatus } from "@/components/status-badge";
// Relative (not "@/") import: this module is covered by a DB-free unit
// test and vitest.config.ts has no path-alias resolution — same reason
// compute-statement.ts avoids "@/".
import { isStatementOverdue, type StoredStatementStatus } from "./is-statement-overdue";

export type { StoredStatementStatus };

/**
 * `overdue` is never stored — statements.ts's own schema comment commits
 * to deriving it. The rule itself now lives in `isStatementOverdue` so the
 * UI badge and the overdue-alert cron share one boundary (including the
 * retroactive-issue grace window — see that module).
 *
 * `today` is passed in (not read from `Date.now()` internally) so this
 * stays a pure, deterministic, unit-testable function. `issuedAt` is
 * optional: pass it wherever the row is available so a freshly-issued
 * retroactive statement isn't shown as OVERDUE on day one; omitting it
 * falls back to the plain `due_date < today` boundary.
 */
export function deriveStatementDisplayStatus(
  status: StoredStatementStatus,
  dueDate: string | null,
  today: string,
  issuedAt: string | null = null,
): StatementDisplayStatus {
  if (isStatementOverdue({ status, dueDate, issuedAt, today })) {
    return "overdue";
  }
  return status;
}
