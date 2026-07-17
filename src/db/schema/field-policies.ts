import { pgTable, uuid, text } from "drizzle-orm/pg-core";

// 3-way editability (CLAUDE.md §3.5): read_only | approval_required | free.
// scope is a free-form key (e.g. a property_id or tenancy_id) letting a
// policy override the global default for one entity; null scope = global.
export const fieldPolicies = pgTable("field_policies", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  fieldName: text("field_name").notNull(),
  policy: text("policy").notNull().default("read_only"),
  scope: text("scope"),
});
