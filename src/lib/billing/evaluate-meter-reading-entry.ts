/**
 * Pure ≥previous validation for a new meter reading entry (CLAUDE.md
 * §3.4: "typed value entry per meter with ≥previous validation, admin can
 * override"). Extracted out of submit-meter-reading.ts so the comparison
 * itself — and specifically the numeric-vs-string coercion it depends on —
 * is unit-testable without a DB or a Supabase session.
 *
 * `previousValue` is deliberately typed `number | string`: it originates
 * from a DB query result (a verified reading's confirmed_value, or a
 * meter's base_value), and PostgREST can return `numeric` columns as
 * strings to avoid float64 precision loss. `enteredValue` is always a
 * clean `number` from the caller's own Zod-validated input.
 *
 * Note: because `enteredValue` is structurally always a number, JS's `>=`
 * already does numeric (not lexicographic) comparison against a string
 * `previousValue` without any help — relational operators only fall back
 * to string comparison when *both* sides are strings. The explicit
 * `Number(...)` below is therefore defensive/documentation, not a fix for
 * a live bug: it makes the intended comparison explicit and keeps this
 * function correct even if `previousValue`'s contract ever changes to
 * `string`-typed on both sides.
 */

export type MeterReadingCallerRole = "owner" | "tenant";

export interface EvaluateMeterReadingEntryInput {
  enteredValue: number;
  previousValue: number | string;
  callerRole: MeterReadingCallerRole;
  override: boolean;
}

export type EvaluateMeterReadingEntryResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function evaluateMeterReadingEntry(
  input: EvaluateMeterReadingEntryInput,
): EvaluateMeterReadingEntryResult {
  const previousValue = Number(input.previousValue);

  if (input.enteredValue >= previousValue) {
    return { allowed: true };
  }

  // Tenants can never bypass this — CLAUDE.md: "admin can override", not
  // tenant. Owners need the explicit flag; a decrease alone isn't enough.
  if (input.callerRole === "owner" && input.override) {
    return { allowed: true };
  }

  const isOwner = input.callerRole === "owner";
  return {
    allowed: false,
    reason:
      `New reading (${input.enteredValue}) is lower than the previous verified reading (${previousValue}).` +
      (isOwner
        ? " Pass override: true to confirm this is expected (e.g. meter replacement)."
        : " Tenants cannot override this — contact the property owner if this is expected."),
  };
}
