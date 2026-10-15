// Charge types an owner can add to a unit in one click (B-42 groundwork,
// long batch 2026-10-15). The code drives display via the
// statements.chargeType catalog (no hardcoded copy, CLAUDE.md §4); kind
// and default unit follow the code. Anything else is a "custom" type with
// an owner-typed name and code = null.
export const CHARGE_PRESETS = [
  { code: "rent", kind: "fixed", unit: null },
  { code: "common_cost", kind: "fixed", unit: null },
  { code: "internet", kind: "fixed", unit: null },
  { code: "electricity", kind: "metered", unit: "kWh" },
  { code: "gas", kind: "metered", unit: "m3" },
  { code: "water", kind: "metered", unit: "m3" },
] as const;

export type ChargePresetCode = (typeof CHARGE_PRESETS)[number]["code"];
export const CHARGE_PRESET_CODES = CHARGE_PRESETS.map((p) => p.code) as [ChargePresetCode, ...ChargePresetCode[]];

// Units are stored as plain ASCII codes; "m3" is shown as m³.
export const METER_UNITS = ["kWh", "m3", "GJ"] as const;

// Owner-creatable kinds: one_off belongs to adjustments only (0008's
// charge_schedules kind gate), so it isn't offered here.
export const CUSTOM_CHARGE_KINDS = ["fixed", "metered", "tracked_only"] as const;

export function presetFor(code: string) {
  return CHARGE_PRESETS.find((p) => p.code === code) ?? null;
}

// Expected-failure codes the billing-setup server actions *return* (not
// throw: Next.js redacts thrown server-action messages in production
// builds, so a thrown code would reach the client as a generic error).
// The UI maps them to catalog strings.
export const BILLING_SETUP_ERRORS = {
  duplicateCode: "BILLING_SETUP_DUPLICATE_CODE",
  notMeterable: "BILLING_SETUP_NOT_METERABLE",
  removedBeforeInstalled: "BILLING_SETUP_REMOVED_BEFORE_INSTALLED",
  readingsAfterRemoval: "BILLING_SETUP_READINGS_AFTER_REMOVAL",
} as const;

export type BillingSetupError = (typeof BILLING_SETUP_ERRORS)[keyof typeof BILLING_SETUP_ERRORS];
export type BillingSetupResult<T = object> = ({ ok: true } & T) | { ok: false; error: BillingSetupError };
