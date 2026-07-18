import { pgTable, uuid, text, date } from "drizzle-orm/pg-core";
import { tenancies } from "./tenancies";
import { persons } from "./persons";
import { registrationTypeEnum } from "./enums";

export const tenancyOccupants = pgTable("tenancy_occupants", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenancyId: uuid("tenancy_id")
    .notNull()
    .references(() => tenancies.id),
  personId: uuid("person_id")
    .notNull()
    .references(() => persons.id),
  // primary | co_occupant | guest
  relationship: text("relationship").notNull(),
  moveIn: date("move_in"),
  moveOut: date("move_out"),
  // Drives the field-requirement engine (field-requirements.ts) — null
  // until set, meaning no requiredness rules apply yet.
  registrationType: registrationTypeEnum("registration_type"),
});
