import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profileRoleEnum } from "./enums";
import { persons } from "./persons";
import { authUsers } from "./auth";

// Collapses ROADMAP's originally-separate `users`+`profiles` into one table
// — a public.users mirror of auth.users would be redundant (Phase 0 plan).
export const profiles = pgTable("profiles", {
  id: uuid("id")
    .primaryKey()
    .references(() => authUsers.id),
  personId: uuid("person_id").references(() => persons.id),
  role: profileRoleEnum("role").notNull(),
  locale: text("locale").notNull().default("hu"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
