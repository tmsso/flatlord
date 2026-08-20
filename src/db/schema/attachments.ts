import { pgTable, uuid, text, bigint, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { persons } from "./persons";

// entity_type was a Postgres enum (attachment_entity_type) in migration
// 0017, but adding a value to it and using that same value in a same-batch
// migration (RLS policies referencing 'inventory_item') hits Postgres's
// "unsafe use of new value of enum type" restriction — drizzle-orm's
// postgres-js migrator wraps *all* pending migration files into one single
// transaction per `migrate()` invocation (see PgDialect.migrate), not one
// transaction per file, so splitting the ADD VALUE into its own file does
// NOT help when both files are pending together (always true for a fresh
// prod apply). Migration 0018 converts this column from the enum to plain
// text + a CHECK constraint instead — CHECK constraints have no such
// restriction, and this keeps the entity-type list open to app-layer
// extension going forward without ever hitting this wall again.
export const ATTACHMENT_ENTITY_TYPES = ["tenancy", "person", "inventory_item", "request"] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

// Generic attachment, reused across entity types (ROADMAP Phase 2 item 4,
// CLAUDE.md §3.6). entity_id has no FK — it's polymorphic across whichever
// table entity_type names, so referential integrity for it is enforced by
// the RLS policies' own joins (migration file) rather than the schema.
// property_id is trigger-set for entity_type = 'tenancy' (denormalized
// from tenancies.property_id, same pattern as contracts.ts) and for
// entity_type = 'inventory_item' (denormalized from inventory_items'
// root property_id, migration 0019); it stays null for entity_type =
// 'person' since persons aren't property-scoped — any owner manages every
// person record (see owner_scope_persons, migration 0001), matching how
// persons' own RLS already works.
// Soft-delete only (deleted_at): CLAUDE.md §3.5 "never hard-delete; status
// flags" applies here too — a removed attachment stays in history.
export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  propertyId: uuid("property_id"),
  // Nullable like contracts.documentPath: the row is inserted first (to
  // get its id), then the file is uploaded to a path keyed by that id, then
  // this column is updated — same two-step idiom as create-contract.ts.
  storagePath: text("storage_path"),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  note: text("note"),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => persons.id),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check(
    "attachments_entity_type_check",
    sql`${table.entityType} in ('tenancy', 'person', 'inventory_item', 'request')`,
  ),
]);
