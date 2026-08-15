import { pgEnum } from "drizzle-orm/pg-core";

export const propertyTypeEnum = pgEnum("property_type", [
  "house",
  "flat",
  "room",
]);

// Only meaningful on a flat with child rooms — see properties.ts for the
// mutual-exclusivity invariant this drives.
export const lettingModeEnum = pgEnum("letting_mode", ["whole", "by_room"]);

export const tenancyStatusEnum = pgEnum("tenancy_status", [
  "draft",
  "active",
  "ended",
  "terminated",
]);

export const documentTypeEnum = pgEnum("document_type", [
  "id_card",
  "passport",
  "residence_permit",
]);

export const profileRoleEnum = pgEnum("profile_role", ["owner", "tenant"]);

// fixed/metered recur via charge_schedules; tracked_only is provider-billed
// directly (e.g. gas) and only recorded for the tenant breakdown, never
// charged; one_off never gets a schedule — it only ever appears via
// adjustments. See charge-schedules.ts for the kind-gating this drives.
export const chargeTypeKindEnum = pgEnum("charge_type_kind", [
  "fixed",
  "metered",
  "tracked_only",
  "one_off",
]);

export const statementStatusEnum = pgEnum("statement_status", [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
]);

export const paymentMethodEnum = pgEnum("payment_method", [
  "bank_transfer",
  "cash",
  "revolut",
  "other",
]);

export const meterReadingStatusEnum = pgEnum("meter_reading_status", [
  "submitted",
  "verified",
  "rejected",
]);

export const meterReadingSourceEnum = pgEnum("meter_reading_source", [
  "tenant",
  "admin",
  "import",
]);

// Drives the field-requirement engine (field-requirements.ts) — inhabitant
// registration type per occupant, per ROADMAP Phase 1's admin bullet.
export const registrationTypeEnum = pgEnum("registration_type", [
  "main_address",
  "temporary",
  "casual",
  "owner_agent",
]);

// draft: uploaded, structured terms not yet confirmed onto the tenancy —
// never shown to the tenant (nothing auto-committed, ROADMAP Phase 2).
// active: exactly one per tenancy (partial unique index), its terms drive
// tenancies.term_start/term_end/notice_days. superseded: a former active
// version, kept for the version chain / history, still tenant-visible.
export const contractStatusEnum = pgEnum("contract_status", ["draft", "active", "superseded"]);
