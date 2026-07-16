import {
  pgTable,
  uuid,
  integer,
  smallint,
  date,
  jsonb,
  timestamp,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { propertyTypeEnum, tenancyStatusEnum } from "./enums";
import { properties } from "./properties";
import { persons } from "./persons";

// unit_type/property_id are denormalized (populated by the M3 migration's
// tenancies_validate_unit trigger from unit_id) so RLS policies read
// property_id directly instead of walking the properties tree per row.
export const tenancies = pgTable(
  "tenancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    unitId: uuid("unit_id")
      .notNull()
      .references(() => properties.id),
    unitType: propertyTypeEnum("unit_type").notNull(),
    propertyId: uuid("property_id").notNull(),
    primaryTenantId: uuid("primary_tenant_id")
      .notNull()
      .references(() => persons.id),
    termStart: date("term_start").notNull(),
    termEnd: date("term_end"),
    noticeDays: integer("notice_days").notNull().default(30),
    dueDay: smallint("due_day").notNull().default(5),
    reminderLeadDays: jsonb("reminder_lead_days").notNull().default({}),
    status: tenancyStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("due_day_range", sql`${table.dueDay} between 1 and 28`),
    check("unit_type_not_house", sql`${table.unitType} in ('flat', 'room')`),
  ],
);
