import { pgTable, uuid, text, boolean, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { persons } from "./persons";

// Admin -> tenant announcements (CLAUDE.md §3.8). type/sequence are
// text+CHECK, not Postgres enums, for the same reason requests.category/
// status are (see requests.ts's comment and project memory
// flatlord_postgres_enum_extend_same_tx): extending an enum and using the
// new value in the same migration transaction fails, and drizzle's
// postgres-js migrator batches every pending migration file into one
// transaction, so splitting files doesn't dodge it either.
export const NOTICE_TYPES = [
  "info",
  "house_rule",
  "payment_reminder",
  "late_payment",
  "formal_warning",
  "contract",
] as const;
export type NoticeType = (typeof NOTICE_TYPES)[number];

// Only meaningful for type = 'formal_warning' (CLAUDE.md §3.8: "formal
// warnings ... carry a sequence"); left null for every other type. Not
// enforced at the DB level that sequence is null unless type is
// formal_warning — the zod schema in issue-notice.ts owns that pairing.
export const NOTICE_SEQUENCES = ["first", "second", "final"] as const;
export type NoticeSequence = (typeof NOTICE_SEQUENCES)[number];

// propertyId is denormalized (trigger-set from tenancyId), same pattern as
// requests.propertyId — owner RLS reads it directly instead of joining
// through tenancies per row. default gen_random_uuid() is a placeholder so
// callers can omit it; the trigger unconditionally overwrites it.
//
// Immutable once issued (CLAUDE.md §3.8: "Immutable once issued") — there
// is deliberately no admin UPDATE/DELETE path anywhere (no RLS UPDATE
// policy for the owner role at all, see migration SQL). The one mutation
// this table ever accepts post-insert is the tenant's own acknowledgement
// (acknowledgedAt/acknowledgedBy), and even that is enforced two ways: a
// narrowly-scoped RLS policy (who/when) plus a BEFORE UPDATE guard trigger
// that rejects any change to a column other than those two (what) — see
// notices_guard_immutable() in the migration. A generic WITH CHECK can't
// express "no other column differs from OLD" (RLS has no OLD/NEW
// cross-reference), so the trigger is the actual enforcement; the RLS
// policy only scopes which rows a tenant may even attempt to touch.
export const notices = pgTable(
  "notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    // Free-text reference like "Clause 7.2" — not a structured FK. The
    // contracts table has no per-clause breakdown, only full document text
    // + full-text search (CLAUDE.md §3.6).
    contractClauseRef: text("contract_clause_ref"),
    sequence: text("sequence"),
    requiresAcknowledgement: boolean("requires_acknowledgement").notNull().default(false),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => persons.id),
    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => persons.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("notices_type_check", sql`${table.type} in ('info', 'house_rule', 'payment_reminder', 'late_payment', 'formal_warning', 'contract')`),
    check("notices_sequence_check", sql`${table.sequence} is null or ${table.sequence} in ('first', 'second', 'final')`),
  ],
);
