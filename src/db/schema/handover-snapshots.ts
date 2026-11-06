import { pgTable, uuid, text, timestamp, jsonb, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { persons } from "./persons";

// B-13: move-in / move-out handover snapshot (CLAUDE.md §3.9). Freezes the
// unit's inventory (condition, ownership, status, photo references) and the
// meter baselines at a point in time. Immutable: RLS has no UPDATE/DELETE
// policy (migration 0039). Photos are references to existing attachment
// paths — attachments are never hard-deleted, so the reference stays valid.
export const handoverSnapshots = pgTable(
  "handover_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    // Denormalized from tenancies by trigger (owner RLS scope).
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    kind: text("kind").notNull(), // 'move_in' | 'move_out'
    takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
    takenBy: uuid("taken_by")
      .notNull()
      .references(() => persons.id),
    note: text("note"),
    // [{ id, title, kind, ownedBy, condition, status, notes, photos: [path] }]
    inventory: jsonb("inventory").notNull().default(sql`'[]'::jsonb`),
    // [{ meterId, label, unit, value, readingDate, source: 'reading' | 'base' }]
    meters: jsonb("meters").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("handover_snapshots_tenancy_id_idx").on(table.tenancyId),
    index("handover_snapshots_taken_by_idx").on(table.takenBy),
    check("handover_snapshots_kind_check", sql`${table.kind} in ('move_in', 'move_out')`),
  ],
);
