import { pgTable, uuid, text, date, timestamp } from "drizzle-orm/pg-core";
import { documentTypeEnum } from "./enums";

// Document-exact identity — spelling corrections against passports are a
// real recurring case (CLAUDE.md §3.2), so these fields are editable with
// history via audit_log, never overwritten silently.
//
// Columns below `dob` were added for the field-requirement engine
// (design/11 + design/12 — "main address" inhabitants need an ID number
// *and* address-card number; ROADMAP Phase 1). All nullable: owner/agent
// records only ever need a name (design/12's "name only · OK" rows).
// `contactEmail` is deliberately not named `email` — it's a free-edit
// contact field shown in design/12, not the Supabase Auth login identity
// (that's `auth.users.email`, kept separate; see ROADMAP Phase 5's email
// change workflow). Sensitive fields here (document number, mothersName,
// taxId, addressCardNumber) must never be written to audit_log verbatim —
// see src/server/audit/log.ts.
export const persons = pgTable("persons", {
  id: uuid("id").primaryKey().defaultRandom(),
  givenName: text("given_name").notNull(),
  familyName: text("family_name").notNull(),
  documentType: documentTypeEnum("document_type"),
  documentNumber: text("document_number"),
  dob: date("dob"),
  birthName: text("birth_name"),
  birthPlace: text("birth_place"),
  mothersName: text("mothers_name"),
  citizenship: text("citizenship"),
  addressCardNumber: text("address_card_number"),
  taxId: text("tax_id"),
  phone: text("phone"),
  contactEmail: text("contact_email"),
  registeredAddress: text("registered_address"),
  temporaryAddress: text("temporary_address"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
