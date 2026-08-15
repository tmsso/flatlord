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

// Deposit ledger (ROADMAP Phase 2, CLAUDE.md §3.2): paid = money received
// into the deposit; applied = offset against a fee (e.g. a rent-reduction
// month); refunded = returned to the tenant; retained = an informational
// marker that the current remaining balance is being held as security
// (no money movement of its own — see compute-deposit-balance.ts for why
// it carries no sign). Never edited/deleted once recorded — see
// deposit-transactions.ts.
export const depositTransactionTypeEnum = pgEnum("deposit_transaction_type", [
  "paid",
  "applied",
  "retained",
  "refunded",
]);

// Inventory module (ROADMAP Phase 2 item 6, CLAUDE.md §3.9). "conditional"
// covers the real case cited there: appliance ownership transferring
// depending on the tenancy's end date — see inventory-items.ts's
// actionByDate/actionByReason columns for how that's represented.
export const inventoryOwnedByEnum = pgEnum("inventory_owned_by", ["owner", "renter", "conditional"]);

// Never hard-deleted (CLAUDE.md §3.5) — "removed" and "transferred" are
// terminal states, not row deletions.
export const inventoryItemStatusEnum = pgEnum("inventory_item_status", ["active", "removed", "transferred"]);

// A reconfirmation campaign covers either every active item on the unit
// ('full') or an admin-picked subset ('subset') — see inventory-
// reconfirmations.ts.
export const inventoryReconfirmationScopeEnum = pgEnum("inventory_reconfirmation_scope", ["full", "subset"]);

export const inventoryReconfirmationStatusEnum = pgEnum("inventory_reconfirmation_status", ["open", "completed"]);

// pending: tenant hasn't responded yet. confirmed: tenant confirmed
// condition/presence as expected. discrepancy: tenant flagged a mismatch —
// CLAUDE.md §3.9 says this should "automatically open requests", but the
// Requests module is Phase 3 and doesn't exist yet (ROADMAP Phase 2 item 6
// scope note) — a discrepancy here instead surfaces in an admin "needs
// review" filter and triggers an owner notification email. Phase 3 can
// wire the real auto-open request against this same status value later.
export const inventoryReconfirmationItemStatusEnum = pgEnum("inventory_reconfirmation_item_status", [
  "pending",
  "confirmed",
  "discrepancy",
]);
