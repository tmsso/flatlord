import { pgTable, uuid, text, date, timestamp, unique, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { persons } from "./persons";
import { inventoryItems } from "./inventory-items";
import {
  inventoryReconfirmationScopeEnum,
  inventoryReconfirmationStatusEnum,
  inventoryReconfirmationItemStatusEnum,
} from "./enums";

// A reconfirmation campaign, admin-triggered against one tenancy (CLAUDE.md
// §3.9). propertyId is trigger-set from tenancies.property_id, same
// denormalization idiom as contracts.ts — used for owner RLS scoping only;
// tenant RLS scopes via tenancyId -> primary_tenant_id directly, same as
// contracts' tenant_scope_contracts.
export const inventoryReconfirmations = pgTable(
  "inventory_reconfirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    scope: inventoryReconfirmationScopeEnum("scope").notNull(),
    status: inventoryReconfirmationStatusEnum("status").notNull().default("open"),
    initiatedBy: uuid("initiated_by")
      .notNull()
      .references(() => persons.id),
    initiatedAt: timestamp("initiated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    dueDate: date("due_date"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("inventory_reconfirmations_tenancy_id_idx").on(table.tenancyId),
    index("inventory_reconfirmations_initiated_by_idx").on(table.initiatedBy),
  ],
);

// One row per item in scope for a campaign — created by the admin action
// that launches the campaign (all active items for 'full', an admin-picked
// subset otherwise). The tenant updates status/tenantNote/confirmedAt on
// their own rows; they never write to the campaign row or the item itself.
export const inventoryReconfirmationItems = pgTable(
  "inventory_reconfirmation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reconfirmationId: uuid("reconfirmation_id")
      .notNull()
      .references(() => inventoryReconfirmations.id),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    status: inventoryReconfirmationItemStatusEnum("status").notNull().default("pending"),
    tenantNote: text("tenant_note"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // reconfirmationId is already the leading column of the unique
    // constraint below, so it's already indexed — only inventoryItemId
    // (the trailing column) needs its own index.
    unique("inventory_reconfirmation_items_unique").on(table.reconfirmationId, table.inventoryItemId),
    index("inventory_reconfirmation_items_inventory_item_id_idx").on(table.inventoryItemId),
  ],
);
