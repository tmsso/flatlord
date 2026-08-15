import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { properties } from "./properties";
import { inventoryOwnedByEnum, inventoryItemStatusEnum } from "./enums";

// A fixture/furnishing belonging to a specific lettable unit (flat/room),
// independent of whoever is currently renting it — CLAUDE.md §3.9.
// unitId is the real scoping FK (mirrors meters.ts: `t.unit_id = ...` is
// how tenant RLS finds "my unit's items", exactly the same pattern
// meters/meter_readings already use to avoid leaking sibling-flat data
// under the same root property). propertyId is the denormalized ROOT
// property id (trigger-set, same as meters_set_property_id) — owner RLS
// scopes by property_ownership on this column, same idiom as every other
// owner-scoped table.
//
// Photos: reuse the generic `attachments` table/bucket (ROADMAP Phase 2
// item 4) with entity_type = 'inventory_item', entity_id = this row's id
// — see migration 0018/0019 for the enum extension + RLS. No separate
// photo column here.
export const inventoryItems = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => properties.id),
  propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  ownedBy: inventoryOwnedByEnum("owned_by").notNull().default("owner"),
  condition: text("condition"),
  notes: text("notes"),
  // Conditional-ownership real case (CLAUDE.md §3.9): an appliance whose
  // ownership transfers depending on the tenancy's end date.
  // actionByDate presence *is* the flag — no separate boolean needed.
  actionByDate: date("action_by_date"),
  actionByReason: text("action_by_reason"),
  status: inventoryItemStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
