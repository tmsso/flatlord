import { pgTable, uuid, bigint, char, date, text, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { statements } from "./statements";
import { persons } from "./persons";
import { depositTransactionTypeEnum } from "./enums";

// Append-only transaction history per tenancy (CLAUDE.md §3.2: "deposit
// ledger... transaction history, not a balance field"). The running
// balance is always computed by summing signed amounts (see
// src/lib/deposits/compute-deposit-balance.ts) — never stored here, so
// there's nothing to keep in sync. `amount` is always a non-negative
// magnitude (same convention as payments.amount); the sign each type
// contributes lives in the balance-computation function, not in this
// table, so this schema can't be misread as "amount is sometimes
// negative".
//
// Rows are never updated or deleted after insert (RLS in the migration
// grants SELECT/INSERT only, no UPDATE/DELETE) — real financial history,
// same "never hard-delete" principle as audit_log (CLAUDE.md §3.5), just
// enforced at the grant level here since there's no status flag to flip
// instead.
export const depositTransactions = pgTable(
  "deposit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    // Denormalized from tenancies.property_id, trigger-set — same pattern
    // as contracts.property_id (migration 0015).
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    type: depositTransactionTypeEnum("type").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("HUF"),
    transactionDate: date("transaction_date").notNull(),
    note: text("note"),
    // Set when an 'applied' transaction offsets a specific statement's
    // fees (CLAUDE.md §3.2's real example: deposit applied as a rent
    // reduction across two named months) — nullable, most transaction
    // types have nothing to point at.
    appliedToStatementId: uuid("applied_to_statement_id").references(() => statements.id),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => persons.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("deposit_transactions_amount_nonnegative", sql`${table.amount} >= 0`)],
);
