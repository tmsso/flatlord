import { pgTable, uuid, text, boolean } from "drizzle-orm/pg-core";
import { registrationTypeEnum } from "./enums";

// Personal-data field mandatoriness driven by inhabitant registration type
// (ROADMAP Phase 1: main_address -> ID number + address card required;
// owner_agent -> name only; etc.), always explainable in-UI via `note`.
// Distinct from field_policies (editability, not requiredness) — a
// different concern. App-enforced (Zod refinement reading this table), not
// a DB CHECK, same as field_policies, and because "explainable" needs a
// reason string a CHECK can't carry. Registration type null = applies to
// all types.
export const fieldRequirements = pgTable("field_requirements", {
  id: uuid("id").primaryKey().defaultRandom(),
  entityType: text("entity_type").notNull().default("person"),
  fieldName: text("field_name").notNull(),
  registrationType: registrationTypeEnum("registration_type"),
  required: boolean("required").notNull(),
  note: text("note"),
});
