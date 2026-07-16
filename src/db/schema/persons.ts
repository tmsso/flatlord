import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { documentTypeEnum } from "./enums";

// Document-exact identity — spelling corrections against passports are a
// real recurring case (CLAUDE.md §3.2), so these fields are editable with
// history via audit_log, never overwritten silently.
export const persons = pgTable("persons", {
  id: uuid("id").primaryKey().defaultRandom(),
  givenName: text("given_name").notNull(),
  familyName: text("family_name").notNull(),
  documentType: documentTypeEnum("document_type"),
  documentNumber: text("document_number"),
  dob: date("dob"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
