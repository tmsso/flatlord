import type { ComputeStatementResult, LineItemInput } from "./compute-statement";

export const ROUNDING_CORRECTION_CODE = "rounding_correction";

export interface ReconciledStatement {
  total: number;
  lineItems: LineItemInput[];
}

/**
 * Historical-import-only reconciliation (Phase 1 M5) — not used by the
 * live create-draft-statement flow, which trusts computeStatement()'s own
 * total directly.
 *
 * computeStatement() rounds each metered line item individually, then
 * sums the integers ("round-per-line"). The real historical sheet instead
 * summed fractional amounts and rounded once at the end ("round-at-total")
 * — confirmed against PRIVATE.md's own anchor figures, not a preference.
 * The two conventions can legitimately disagree by ±1 HUF in a given
 * month (verified: 13 of 32 real months). computeStatement() isn't wrong
 * — it's a different, self-consistent convention that doesn't happen to
 * match this one historical billing method.
 *
 * To store the actually-billed historical total while keeping
 * `Σ(line items) === total` intact (statement_line_items.amount is
 * bigint, so the drift can't just be absorbed silently), this appends one
 * explicit rounding-correction line item for the ±1 HUF delta —
 * standard accounting practice, auditable, rather than silently editing
 * an existing line or leaving the sums inconsistent.
 */
export function reconcileStatementTotal(
  computed: ComputeStatementResult,
  billedTotal: number,
): ReconciledStatement {
  const delta = billedTotal - computed.total;
  if (delta === 0) {
    return { total: computed.total, lineItems: computed.lineItems };
  }
  const correctionLineItem: LineItemInput = {
    chargeTypeId: ROUNDING_CORRECTION_CODE,
    description: "Rounding correction (round-per-line vs. historical round-at-total)",
    quantity: null,
    unitRate: null,
    amount: delta,
    isBillable: true,
    chargeScheduleId: null,
    meterId: null,
    fromReadingId: null,
    toReadingId: null,
    adjustmentId: null,
    sortOrder: computed.lineItems.length,
  };
  return { total: billedTotal, lineItems: [...computed.lineItems, correctionLineItem] };
}
