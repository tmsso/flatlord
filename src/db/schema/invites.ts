import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { profileRoleEnum } from "./enums";
import { persons } from "./persons";

// Required for the Phase 0 accept criterion "admin can invite via one-time
// token and revoke it" — implied by ROADMAP but not previously a named
// table. Never store the raw token, only its hash.
export const invites = pgTable("invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull(),
  role: profileRoleEnum("role").notNull(),
  personId: uuid("person_id").references(() => persons.id),
  invitedBy: uuid("invited_by").references(() => persons.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
