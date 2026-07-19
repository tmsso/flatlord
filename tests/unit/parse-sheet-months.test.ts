import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCsvGrid } from "../../src/lib/billing/read-csv-grid";
import { meterBaseValue, parseSheetMonths } from "../../src/lib/billing/parse-sheet-months";

// DB-free, no `postgres` import — same pure-function pattern as
// compute-statement.test.ts. Exercises the shared grid interpreter
// against the synthetic fixture (10 months, Oct 2023 - Jul 2024).

const csvText = readFileSync("fixtures/sheet-demo.csv", "utf8");
const grid = readCsvGrid(csvText);

describe("parseSheetMonths", () => {
  it("transposes the wide sheet into one record per canonical month", () => {
    const months = parseSheetMonths(grid);
    expect(months).toHaveLength(10);
    expect(months[0].periodMonth).toBe("2023-10-01");
    expect(months[9].periodMonth).toBe("2024-07-01");
  });

  it("extracts fixed items, dropping nothing that's actually present", () => {
    const months = parseSheetMonths(grid);
    const oct = months[0];
    expect(oct.fixedItems).toEqual(
      expect.arrayContaining([
        { code: "rent", amount: 200000 },
        { code: "common_cost", amount: 15000 },
        { code: "internet", amount: 5000 },
      ]),
    );
  });

  it("extracts meter readings and rates for the same month", () => {
    const months = parseSheetMonths(grid);
    const jan = months.find((m) => m.periodMonth === "2024-01-01")!;
    expect(jan.meterReadings).toEqual(
      expect.arrayContaining([{ meterCode: "gas", value: 80.353 }]),
    );
    expect(jan.meterRates).toEqual(expect.arrayContaining([{ meterCode: "electricity", rate: 45 }]));
  });

  it("extracts a signed one-off adjustment only in the month it applies", () => {
    const months = parseSheetMonths(grid);
    const feb = months.find((m) => m.periodMonth === "2024-02-01")!;
    expect(feb.adjustments).toEqual([{ amount: -3000, reason: "Other" }]);
    const jan = months.find((m) => m.periodMonth === "2024-01-01")!;
    expect(jan.adjustments).toEqual([]);
  });

  it("captures both payment dates for a month with a split-date entry", () => {
    const months = parseSheetMonths(grid);
    const dec = months.find((m) => m.periodMonth === "2023-12-01")!;
    expect(dec.payments).toEqual([{ paidAt: "2024-01-05" }, { paidAt: "2024-01-28" }]);
    const jan = months.find((m) => m.periodMonth === "2024-01-01")!;
    expect(jan.payments).toEqual([{ paidAt: "2024-02-05" }]);
  });

  it("carries the sheet's own fractional payable total, unrounded", () => {
    const months = parseSheetMonths(grid);
    const jan = months.find((m) => m.periodMonth === "2024-01-01")!;
    expect(jan.sheetPayableTotal).toBeCloseTo(228763.345, 3);
  });

  it("excludes a month whose Payable cell is empty (non-canonical placeholder, e.g. an in-progress trailing month)", () => {
    // Minimal hand-built grid: two month columns, second one's Payable
    // cell is blank — mirrors the real sheet's in-progress trailing
    // column, which this rule must exclude without any date-based
    // special-casing (see ROW.PAYABLE in sheet-grid.ts).
    const minimalGrid: (string | number | null)[][] = [];
    minimalGrid[4] = ["Rental fee", "HUF", "", 200000, 0]; // row 5
    minimalGrid[31] = ["Payable for the period", "HUF", "", 215000, null]; // row 32
    const months = parseSheetMonths(minimalGrid);
    expect(months).toHaveLength(1);
    expect(months[0].periodMonth).toBe("2023-10-01");
  });

  it("reads meter base values independently of the month rows", () => {
    expect(meterBaseValue(grid, "gas")).toBe(0.15);
    expect(meterBaseValue(grid, "electricity")).toBe(0);
  });
});
