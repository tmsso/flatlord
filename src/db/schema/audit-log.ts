import { pgTable, uuid, text, jsonb, timestamp } from "drizzle-orm/pg-core";

// Generic, reused everywhere — never hard-delete anywhere in this schema
// (CLAUDE.md §3.5); this table is the history.
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  before: jsonb("before"),
  after: jsonb("after"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});
