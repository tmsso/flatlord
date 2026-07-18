import { pgTable, uuid, text, numeric, bigint, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { statements } from "./statements";
import { chargeTypes } from "./charge-types";
import { chargeSchedules } from "./charge-schedules";
import { meters } from "./meters";
import { meterReadings } from "./meter-readings";
import { adjustments } from "./adjustments";

// One row per contributing source per month: one per charge_schedule in
// force (fixed), one per meter per statement (metered/tracked-only — a
// mid-month meter replacement naturally yields two rows under the same
// charge_type), one per applicable adjustment. The total is SUM(amount);
// grouping by charge_type_id drives the tenant breakdown/charts without
// hardcoding a category set.
//
// Typed FKs, not polymorphic — matches the repo's convention everywhere
// except the deliberately-polymorphic audit_log. Expected combinations
// (documented here, not a CHECK — too fiddly to be worth DB-level
// enforcement given the repo's own pragmatic style):
//   fixed      -> charge_schedule_id only
//   metered    -> charge_schedule_id + meter_id + from/to_reading_id
//   tracked_only -> meter_id + from/to_reading_id only, is_billable=false, amount=0
//   adjustment -> adjustment_id only
//
// Currency-neutral naming (CLAUDE.md §6): no `currency` column at this
// granularity, implicitly the parent statement's currency; see IDEAS.md.
export const statementLineItems = pgTable("statement_line_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  statementId: uuid("statement_id")
    .notNull()
    .references(() => statements.id),
  // Denormalized from statements.tenancy_id/property_id, trigger-set.
  tenancyId: uuid("tenancy_id").notNull().default(sql`gen_random_uuid()`),
  propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
  chargeTypeId: uuid("charge_type_id")
    .notNull()
    .references(() => chargeTypes.id),
  // Snapshotted label, e.g. "Electricity (Kitchen meter)".
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 14, scale: 3 }), // meter delta; null for fixed/adjustment
  unitRate: numeric("unit_rate", { precision: 12, scale: 4 }), // null for fixed/adjustment
  amount: bigint("amount", { mode: "number" }).notNull(), // rounded per line; see computeStatement (M4)
  isBillable: boolean("is_billable").notNull().default(true), // false for tracked_only rows
  chargeScheduleId: uuid("charge_schedule_id").references(() => chargeSchedules.id),
  meterId: uuid("meter_id").references(() => meters.id),
  fromReadingId: uuid("from_reading_id").references(() => meterReadings.id),
  toReadingId: uuid("to_reading_id").references(() => meterReadings.id),
  adjustmentId: uuid("adjustment_id").references(() => adjustments.id),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
