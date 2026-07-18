import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { properties } from "./properties";
import { chargeTypes } from "./charge-types";

// Per-unit, persists across tenancy turnover (CLAUDE.md §3.4: "meter
// replacement starts a new meter record with a new base value", not a new
// tenancy). Each meter links to exactly one metered/tracked_only
// charge_type — several meter rows can share one charge_type_id (multiple
// water meters, one tariff), enforced by
// trg_meters_validate_charge_type_kind in the M1 follow-up migration.
//
// No status enum: active/replaced/removed derives from removed_at /
// replaces_meter_id — fewer redundant columns to keep in sync.
export const meters = pgTable("meters", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => properties.id),
  // Denormalized root, populated by trg_meters_set_property_id.
  propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
  chargeTypeId: uuid("charge_type_id")
    .notNull()
    .references(() => chargeTypes.id),
  label: text("label").notNull(), // "Kitchen water", "Electricity"
  baseValue: numeric("base_value", { precision: 14, scale: 3 }).notNull(),
  installedAt: date("installed_at").notNull(),
  removedAt: date("removed_at"),
  replacesMeterId: uuid("replaces_meter_id").references((): AnyPgColumn => meters.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
