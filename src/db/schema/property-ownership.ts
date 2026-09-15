import { pgTable, uuid, numeric, unique, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { properties } from "./properties";
import { persons } from "./persons";

// Ownership chips (design/11) — also the RLS owner-scope source. property_id
// must reference a root node (house or top-level flat); enforced by trigger
// in the M3 migration, not expressible as a plain CHECK (needs a lookup).
export const propertyOwnership = pgTable(
  "property_ownership",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    propertyId: uuid("property_id")
      .notNull()
      .references(() => properties.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id),
    percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(),
  },
  (table) => [
    // propertyId is already the leading column of the unique constraint
    // below, so it's already indexed — only personId (the trailing
    // column) needs its own index.
    unique("property_ownership_property_person_unique").on(
      table.propertyId,
      table.personId,
    ),
    index("property_ownership_person_id_idx").on(table.personId),
    check(
      "percentage_range",
      sql`${table.percentage} > 0 and ${table.percentage} <= 100`,
    ),
  ],
);
