import { pgTable, uuid, bigint, char, date, jsonb, timestamp, unique } from "drizzle-orm/pg-core";
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
    totalHuf: bigint("total_huf", { mode: "number" }).notNull().default(0),
    currency: char("currency", { length: 3 }).notNull().default("HUF"),
    // Immutable snapshot of non-line-item context at issue time (due day,
    // reminder lead days, tenant contact info) — line items are also
    // immutable once issued, this covers everything else.
    issuedSnapshot: jsonb("issued_snapshot"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("statements_tenancy_period_unique").on(table.tenancyId, table.periodMonth)],
);
