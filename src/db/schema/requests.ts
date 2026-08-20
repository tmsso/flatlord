import { pgTable, uuid, text, timestamp, jsonb, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { persons } from "./persons";

// Tenant<->admin workflow (CLAUDE.md §3.7) AND the approval-required
// field-change flow (§3.5, Phase 3's field-editability item, built on top
// of this table rather than a separate one — changePayload below is
// reserved for it). category/status are text+CHECK, not a Postgres enum:
// extending an enum and using the new value in the same migration
// transaction fails, and drizzle's postgres-js migrator batches every
// pending migration file into one transaction, so splitting files doesn't
// dodge it either (see attachments.ts's identical note, and project
// memory flatlord_postgres_enum_extend_same_tx). Both columns will
// plausibly grow new values later (e.g. field-editability adding a
// category), so avoid the trap now rather than migrating away from it
// under pressure like attachments.entity_type had to.
export const REQUEST_CATEGORIES = [
  "repair",
  "contract_change",
  "personal_data_change",
  "inventory",
  "billing_question",
  "other",
] as const;
export type RequestCategory = (typeof REQUEST_CATEGORIES)[number];

export const REQUEST_STATUSES = ["open", "resolved", "rejected", "withdrawn"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

// propertyId is denormalized (trigger-set from tenancyId, same pattern as
// inventory_reconfirmations.property_id) so owner RLS reads it directly
// instead of joining through tenancies per row. default gen_random_uuid()
// is a placeholder so callers can omit it — the trigger unconditionally
// overwrites it, matching tenancies.propertyId's own convention.
export const requests = pgTable(
  "requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    category: text("category").notNull(),
    status: text("status").notNull().default("open"),
    title: text("title").notNull(),
    description: text("description"),
    externalCaseRef: text("external_case_ref"),
    appointmentDate: timestamp("appointment_date", { withTimezone: true }),
    // Reserved for Phase 3's field-editability item: { entityType,
    // entityId, fieldName, oldValue, newValue } for an approval-required
    // change request. Genuinely unused/unwritten by this migration.
    changePayload: jsonb("change_payload"),
    initiatedBy: uuid("initiated_by")
      .notNull()
      .references(() => persons.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "requests_category_check",
      sql`${table.category} in ('repair', 'contract_change', 'personal_data_change', 'inventory', 'billing_question', 'other')`,
    ),
    check("requests_status_check", sql`${table.status} in ('open', 'resolved', 'rejected', 'withdrawn')`),
  ],
);

// Threaded conversation (§3.7). No per-message attachments — documents
// attach at the request level via the generic `attachments` table
// (entity_type = 'request'), same idiom as every other entity there.
export const requestMessages = pgTable("request_messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  requestId: uuid("request_id")
    .notNull()
    .references(() => requests.id),
  authorId: uuid("author_id")
    .notNull()
    .references(() => persons.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
