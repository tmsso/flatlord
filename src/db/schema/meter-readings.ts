import { pgTable, uuid, numeric, date, text, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { meters } from "./meters";
import { tenancies } from "./tenancies";
import { persons } from "./persons";
import { meterReadingStatusEnum, meterReadingSourceEnum } from "./enums";

// Tenant-writable, entered/OCR/confirmed columns per CLAUDE.md §3.4 (AI
// wiring is Phase 5, columns exist now). Deliberately no DB-level
// "≥previous" CHECK — meter replacement and rollover are real exceptions
// the admin must be able to override, which a CHECK can't express without
// a lookup trigger that would then need to special-case every legitimate
// decrease. Stays app-level: Zod + a lookup against the meter's last
// verified reading. Only status='verified' readings are billable —
// enforced by the statement engine's read query (M4), not a DB constraint.
export const meterReadings = pgTable("meter_readings", {
  id: uuid("id").primaryKey().defaultRandom(),
  meterId: uuid("meter_id")
    .notNull()
    .references(() => meters.id),
  tenancyId: uuid("tenancy_id")
    .notNull()
    .references(() => tenancies.id),
  // Denormalized from tenancies.property_id, trigger-set.
  propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
  readingDate: date("reading_date").notNull(),
  enteredValue: numeric("entered_value", { precision: 14, scale: 3 }).notNull(),
  enteredBy: uuid("entered_by")
    .notNull()
    .references(() => persons.id),
  ocrValue: numeric("ocr_value", { precision: 14, scale: 3 }),
  ocrConfidence: numeric("ocr_confidence", { precision: 4, scale: 3 }),
  confirmedValue: numeric("confirmed_value", { precision: 14, scale: 3 }),
  confirmedBy: uuid("confirmed_by").references(() => persons.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  // Storage path in the `meter-photos` bucket.
  photoPath: text("photo_path"),
  status: meterReadingStatusEnum("status").notNull().default("submitted"),
  source: meterReadingSourceEnum("source").notNull().default("tenant"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
