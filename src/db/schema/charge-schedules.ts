import { pgTable, uuid, bigint, numeric, date, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenancies } from "./tenancies";
import { chargeTypes } from "./charge-types";

// Tenancy-scoped effective-dated rate/amount (CLAUDE.md §3.2/§3.3). Rent is
// negotiated per tenancy, not per unit — a fresh schedule naturally starts
// on tenant turnover rather than needing termination logic against the old
// tenant's valid_to. charge_types stays the reusable per-unit catalog
// across turnover; this is where the actual negotiated numbers live.
//
// Same table for fixed/metered (kind-gated nullable columns), not two
// tables — mirrors how properties already kind-gates address_line/hrsz/
// letting_mode by type. Which column is populated, the no-overlap
// invariant, and the tracked_only/one_off rejection are all enforced by
// trg_charge_schedules_validate_kind + the deferred overlap-guard trigger
// in the M1 follow-up migration (not expressible as a plain CHECK — both
// need a lookup against charge_types.kind or sibling rows).
export const chargeSchedules = pgTable("charge_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenancyId: uuid("tenancy_id")
    .notNull()
    .references(() => tenancies.id),
  chargeTypeId: uuid("charge_type_id")
    .notNull()
    .references(() => chargeTypes.id),
  // Denormalized from tenancies.property_id, trigger-set.
  propertyId: uuid("property_id").notNull().default(sql`gen_random_uuid()`),
  // Currency-neutral naming (CLAUDE.md §6): HUF is the only currency in
  // practice today, but the column name doesn't bake that in. No `currency`
  // column at this granularity yet — implicitly the tenancy's single
  // currency (today always HUF via `statements.currency`); see IDEAS.md
  // (EUR-based pricing) for what per-schedule currency would require.
  amount: bigint("amount", { mode: "number" }), // fixed only
  ratePerUnit: numeric("rate_per_unit", { precision: 12, scale: 4 }), // metered only
  validFrom: date("valid_from").notNull(),
  validTo: date("valid_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
