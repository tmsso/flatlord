import { describe, expect, it } from "vitest";
import { ROUNDING_CORRECTION_CODE, reconcileStatementTotal } from "../../src/lib/billing/reconcile-statement-total";
import type { ComputeStatementResult } from "../../src/lib/billing/compute-statement";

const baseLineItem = {
  chargeTypeId: "rent",
  description: "rent",
  quantity: null,
  unitRate: null,
  amount: 100000,
  isBillable: true,
  chargeScheduleId: null,
  meterId: null,
  fromReadingId: null,
  toReadingId: null,
  adjustmentId: null,
  sortOrder: 0,
};

function computed(total: number): ComputeStatementResult {
  return { lineItems: [baseLineItem], total, warnings: [] };
}

describe("reconcileStatementTotal", () => {
  it("adds no correction line when the engine total already matches the billed total", () => {
    const result = reconcileStatementTotal(computed(100000), 100000);
    expect(result).toEqual({ total: 100000, lineItems: [baseLineItem] });
  });

  it("appends a correction line item for a +1 discrepancy, keeping Σ(line items) === total", () => {
    const result = reconcileStatementTotal(computed(100000), 100001);
    expect(result.total).toBe(100001);
    expect(result.lineItems).toHaveLength(2);
    const correction = result.lineItems[1];
    expect(correction.chargeTypeId).toBe(ROUNDING_CORRECTION_CODE);
    expect(correction.amount).toBe(1);
    expect(result.lineItems.reduce((sum, li) => sum + li.amount, 0)).toBe(result.total);
  });

  it("appends a negative correction line item for a -1 discrepancy", () => {
    const result = reconcileStatementTotal(computed(100000), 99999);
    expect(result.lineItems[1].amount).toBe(-1);
    expect(result.lineItems.reduce((sum, li) => sum + li.amount, 0)).toBe(result.total);
  });
});
