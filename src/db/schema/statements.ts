import { pgTable, uuid, bigint, char, date, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { statementStatusEnum } from "./enums";

// draft -> issued (immutable snapshot) -> partially_paid/paid/overdue
// (CLAUDE.md §3.3). Issuing snapshots all inputs immutably; corrections via
// new adjustment lines, never edits to issued statements — enforced by
// trg_statements_prevent_issued_mutation in the M1 follow-up migration.
// status only moves forward post-issue via trg_statements_recompute_status
// (driven by payments), never by direct app UPDATE.
//
// `overdue` exists as a status value but Phase 1 never sets it via a job —
// that's Phase 4's cron. For now overdue is derived for display:
// status IN ('issued','partially_paid') AND due_date < current_date.
export const statements = pgTable(
  "statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    // Denormalized from tenancies.property_id, trigger-set.
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    periodMonth: date("period_month").notNull(), // first-of-month
    status: statementStatusEnum("status").notNull().default("draft"),
    // Computed from tenancy.due_day, snapshotted at issue.
    dueDate: date("due_date"),
    // Currency-neutral naming (CLAUDE.md §6) — `currency` carries the
    // actual currency, HUF-only in practice today; see IDEAS.md.
    total: bigint("total", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("HUF"),
    // Immutable snapshot of non-line-item context at issue time (due day,
    // reminder lead days, tenant contact info) — line items are also
    // immutable once issued, this covers everything else.
    issuedSnapshot: jsonb("issued_snapshot"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    // BACKLOG.md B-05: "discard draft" for a wedged/incomplete draft, so
    // the (tenancy_id, period_month) slot can be regenerated. Same
    // never-hard-delete idiom as adjustments.voidedAt — only ever set on
    // a `draft` row (trg_statements_prevent_issued_mutation never
    // touches this column, and the discard action itself refuses
    // anything that isn't still a draft). The old row and its line items
    // stay in place as a record of what was computed; a fresh draft for
    // the same period is a new row.
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Partial (not a plain unique constraint): a voided draft must free
    // its period for a fresh one, but two simultaneously *live* rows for
    // the same tenancy+period still can't coexist.
    uniqueIndex("statements_tenancy_period_unique")
      .on(table.tenancyId, table.periodMonth)
      .where(sql`voided_at is null`),
  ],
);
