import { describe, expect, it } from "vitest";
import {
  computeMonthlyCostSeries,
  computeConsumptionSeries,
  lastNMonths,
  type LineItemRow,
} from "../../src/lib/billing/compute-chart-series";

function row(overrides: Partial<LineItemRow>): LineItemRow {
  return {
    periodMonth: "2026-07-01",
    chargeTypeId: "ct-1",
    chargeTypeCode: null,
    chargeTypeName: "Charge",
    chargeTypeKind: "fixed",
    chargeTypeUnit: null,
    meterId: null,
    quantity: null,
    amount: 0,
    isAdjustment: false,
    ...overrides,
  };
}

describe("computeMonthlyCostSeries", () => {
  it("buckets rent, other fixed, metered (by charge type), and adjustments separately", () => {
    const rows: LineItemRow[] = [
      row({ chargeTypeId: "rent", chargeTypeCode: "rent", chargeTypeName: "Rent", amount: 245000 }),
      row({ chargeTypeId: "common", chargeTypeCode: "common_cost", chargeTypeName: "Common cost", amount: 18500 }),
      row({ chargeTypeId: "elec", chargeTypeCode: "electricity", chargeTypeName: "Electricity", chargeTypeKind: "metered", meterId: "m1", quantity: 198, amount: 14256 }),
      row({ chargeTypeId: "adj-1", chargeTypeName: "One-off correction", isAdjustment: true, amount: 12000 }),
    ];
    const [month] = computeMonthlyCostSeries(rows, ["2026-07-01"]);
    expect(month.rent).toBe(245000);
    expect(month.fixedOther).toBe(18500);
    expect(month.metered).toEqual([{ chargeTypeId: "elec", label: "Electricity", amount: 14256 }]);
    expect(month.adjustment).toBe(12000);
    expect(month.total).toBe(245000 + 18500 + 14256 + 12000);
  });

  it("excludes tracked_only rows from cost (amount is always 0 for them, but stay explicit)", () => {
    const rows: LineItemRow[] = [row({ chargeTypeId: "gas", chargeTypeKind: "tracked_only", meterId: "m2", quantity: 19, amount: 0 })];
    const [month] = computeMonthlyCostSeries(rows, ["2026-07-01"]);
    expect(month.metered).toEqual([]);
    expect(month.total).toBe(0);
  });

  it("fills months with no statement data as all-zero, not missing", () => {
    const months = computeMonthlyCostSeries([], ["2026-06-01", "2026-07-01"]);
    expect(months).toHaveLength(2);
    expect(months[0].total).toBe(0);
  });
});

describe("computeConsumptionSeries", () => {
  it("groups quantity by charge type (meter identity), for metered and tracked_only alike", () => {
    const rows: LineItemRow[] = [
      row({ chargeTypeId: "elec", chargeTypeName: "Electricity", chargeTypeKind: "metered", chargeTypeUnit: "kWh", meterId: "m1", quantity: 198 }),
      row({ chargeTypeId: "gas", chargeTypeName: "Gas", chargeTypeKind: "tracked_only", chargeTypeUnit: "m3", meterId: "m2", quantity: 19 }),
      row({ chargeTypeId: "rent", chargeTypeName: "Rent", chargeTypeKind: "fixed", quantity: null }),
    ];
    const [month] = computeConsumptionSeries(rows, ["2026-07-01"]);
    expect(month.meters).toEqual([
      { chargeTypeId: "elec", label: "Electricity", unit: "kWh", quantity: 198 },
      { chargeTypeId: "gas", label: "Gas", unit: "m3", quantity: 19 },
    ]);
  });

  it("sums multiple meters sharing one charge type within a month", () => {
    const rows: LineItemRow[] = [
      row({ chargeTypeId: "water", chargeTypeName: "Water", chargeTypeKind: "metered", chargeTypeUnit: "m3", meterId: "m3", quantity: 2.1 }),
      row({ chargeTypeId: "water", chargeTypeName: "Water", chargeTypeKind: "metered", chargeTypeUnit: "m3", meterId: "m4", quantity: 1.1 }),
    ];
    const [month] = computeConsumptionSeries(rows, ["2026-07-01"]);
    expect(month.meters).toEqual([{ chargeTypeId: "water", label: "Water", unit: "m3", quantity: 3.2 }]);
  });
});

describe("lastNMonths", () => {
  it("returns N calendar months ending at endMonth, oldest first", () => {
    expect(lastNMonths("2026-07-15", 3)).toEqual(["2026-05-01", "2026-06-01", "2026-07-01"]);
  });

  it("handles year rollover", () => {
    expect(lastNMonths("2026-01-31", 2)).toEqual(["2025-12-01", "2026-01-01"]);
  });
});
