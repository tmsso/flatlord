import { pgSchema, uuid } from "drizzle-orm/pg-core";

// Minimal stub of Supabase's managed auth.users table — just enough for
// profiles.id to have a real FK target. Supabase owns this table's actual
// definition/migrations; we never generate DDL for the auth schema itself.
export const authSchema = pgSchema("auth");

export const authUsers = authSchema.table("users", {
  id: uuid("id").primaryKey(),
});
