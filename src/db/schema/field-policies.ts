import { pgTable, uuid, text, index } from "drizzle-orm/pg-core";
import { properties } from "./properties";

// 3-way editability (CLAUDE.md §3.5): read_only | approval_required | free.
//
// Since migration 0032 (owner isolation) policies are per root property:
// a row with `propertyId` is that property owner's setting; rows with a
// null `propertyId` are built-in defaults every property falls back to,
// readable by all and writable by no app user. `scope` is the original
// free-form override key, unused by the app.
export const fieldPolicies = pgTable(
  "field_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    fieldName: text("field_name").notNull(),
    policy: text("policy").notNull().default("read_only"),
    scope: text("scope"),
    propertyId: uuid("property_id").references(() => properties.id),
  },
  (table) => [index("field_policies_property_id_idx").on(table.propertyId)],
);
