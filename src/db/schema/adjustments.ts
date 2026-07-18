import { pgTable, uuid, bigint, text, date, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { chargeTypes } from "./charge-types";
import { persons } from "./persons";

// Single mechanism for every ad-hoc/non-recurring line (CLAUDE.md §3.3):
// true one-offs, discounts/credits, and bounded-period recurring
// surcharges — the latter is one row with a date range
// (target_month..target_month_end), not one row per month, matching the
// effective-dating idiom charge_schedules already uses. charge_type_id is
// NOT NULL: every line traces to a category so the tenant breakdown/charts
// never hardcode a category (typically a one_off-kind charge_type, but
// nothing stops a correcting adjustment against a fixed/metered type).
export const adjustments = pgTable(
  "adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenancyId: uuid("tenancy_id")
      .notNull()
      .references(() => tenancies.id),
    chargeTypeId: uuid("charge_type_id")
      .notNull()
      .references(() => chargeTypes.id),
    // Denormalized from tenancies.property_id, trigger-set.
    propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
    // Signed: positive surcharge, negative credit/discount. Currency-neutral
    // naming (CLAUDE.md §6) — implicitly the tenancy's currency (today
    // always HUF); see IDEAS.md (EUR-based pricing).
    amount: bigint("amount", { mode: "number" }).notNull(),
    reason: text("reason").notNull(),
    targetMonth: date("target_month").notNull(), // first-of-month
    // Null = single month; set = inclusive bounded recurring range.
    targetMonthEnd: date("target_month_end"),
    // Status flag, never hard-delete (CLAUDE.md §3.5).
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    // Actor convention matches invites.invited_by -> persons.id (Phase 0).
    createdBy: uuid("created_by")
      .notNull()
      .references(() => persons.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "target_month_end_after_start",
      sql`${table.targetMonthEnd} is null or ${table.targetMonthEnd} >= ${table.targetMonth}`,
    ),
    check(
      "target_month_is_month_start",
      sql`date_trunc('month', ${table.targetMonth}) = ${table.targetMonth}`,
    ),
    check(
      "target_month_end_is_month_start",
      sql`${table.targetMonthEnd} is null or date_trunc('month', ${table.targetMonthEnd}) = ${table.targetMonthEnd}`,
    ),
  ],
);
