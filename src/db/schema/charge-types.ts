import { pgTable, uuid, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { chargeTypeKindEnum } from "./enums";
import { properties } from "./properties";

// Property-scoped catalog (CLAUDE.md §3.3) — unit-level, the same
// granularity as tenancies.unit_id, so a by-room letting can carry a
// different catalog per room. "Switched on/off per property" is the
// `active` flag, since the row is already 1:1 scoped by unit_id.
export const chargeTypes = pgTable("charge_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  unitId: uuid("unit_id")
    .notNull()
    .references(() => properties.id),
  // Denormalized root, populated by trg_charge_types_set_property_id from
  // unit_id — mirrors tenancies.property_id, used for owner-scope RLS
  // without a tree-walk.
  propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
  kind: chargeTypeKindEnum("kind").notNull(),
  // Stable machine key for i18n catalog lookup (CLAUDE.md §4 — no
  // hardcoded copy) — e.g. "rent", "common_cost", "electricity". Null for
  // landlord-invented ad-hoc one_off types, which fall back to `name`.
  code: text("code"),
  name: text("name").notNull(),
  // "kWh" / "m3" — metered/tracked_only only.
  unit: text("unit"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
