import { pgTable, uuid, bigint, char, date, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { statements } from "./statements";
import { persons } from "./persons";
import { paymentMethodEnum } from "./enums";

// Multiple transactions per statement (CLAUDE.md §3.3 — split/partial
// payments occur in reality). trg_statements_recompute_status (M1 follow-up
// migration) sums payments for the statement and moves its status between
// issued/partially_paid/paid — the one place status changes post-issue.
export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  statementId: uuid("statement_id")
    .notNull()
    .references(() => statements.id),
  // Denormalized from statements.tenancy_id/property_id, trigger-set.
  tenancyId: uuid("tenancy_id").notNull().default(sql`gen_random_uuid()`),
  propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
  // Currency-neutral naming (CLAUDE.md §6) — `currency` carries the
  // actual currency, HUF-only in practice today; see IDEAS.md.
  amount: bigint("amount", { mode: "number" }).notNull(),
  currency: char("currency", { length: 3 }).notNull().default("HUF"),
  paidAt: date("paid_at").notNull(),
  method: paymentMethodEnum("method").notNull(),
  note: text("note"),
  // Actor convention matches invites.invited_by -> persons.id (Phase 0).
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => persons.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
