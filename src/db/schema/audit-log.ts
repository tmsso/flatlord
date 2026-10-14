import { pgTable, uuid, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { properties } from "./properties";

// Generic, reused everywhere — never hard-delete anywhere in this schema
// (CLAUDE.md §3.5); this table is the history.
//
// `propertyId` (migration 0032, owner isolation): the root property the
// audited entity belongs to, derived by a BEFORE INSERT trigger from
// (entity_type, entity_id) so no logAudit() call site has to pass it.
// Null for property-less entities (person) — those rows are visible to an
// owner who can see that person.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    propertyId: uuid("property_id").references(() => properties.id),
  },
  (table) => [
    index("audit_log_entity_type_entity_id_idx").on(table.entityType, table.entityId),
    index("audit_log_property_id_idx").on(table.propertyId),
  ],
);
