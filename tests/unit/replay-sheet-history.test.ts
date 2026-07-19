import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readCsvGrid } from "../../src/lib/billing/read-csv-grid";
import { readWorkbookGrid } from "../../src/lib/billing/read-workbook-grid";
import { meterBaseValue, parseSheetMonths } from "../../src/lib/billing/parse-sheet-months";
import { replaySheetHistory } from "../../src/lib/billing/replay-sheet-history";

// DB-free pure-function tests, same pattern as compute-statement.test.ts.

const csvText = readFileSync("fixtures/sheet-demo.csv", "utf8");
const grid = readCsvGrid(csvText);
const months = parseSheetMonths(grid);
const meterBaseValues = {
  electricity: meterBaseValue(grid, "electricity"),
  gas: meterBaseValue(grid, "gas"),
  water_bathroom: meterBaseValue(grid, "water_bathroom"),
  water_kitchen: meterBaseValue(grid, "water_kitchen"),
};

describe("replaySheetHistory", () => {
  it("collapses a non-adjacent-equal-value run into two separate schedules, not one spanning the dip", () => {
    // Rent: 200000 (Oct-Jan) -> 150000 (Feb-Mar, dip) -> 200000 (Apr-Jul).
    // A naive group-by-value collapse would merge the two 200000 runs into
    // one schedule covering the dip months too.
    const { chargeSchedules } = replaySheetHistory(months, meterBaseValues);
    const rentSchedules = chargeSchedules.filter((s) => s.chargeTypeId === "rent").sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    expect(rentSchedules).toHaveLength(3);
    expect(rentSchedules[0]).toMatchObject({ amount: 200000, validFrom: "2023-10-01", validTo: "2024-01-01" });
    expect(rentSchedules[1]).toMatchObject({ amount: 150000, validFrom: "2024-02-01", validTo: "2024-03-01" });
    expect(rentSchedules[2]).toMatchObject({ amount: 200000, validFrom: "2024-04-01", validTo: null });
  });

  it("collapses a mid-history fixed-charge rate change into two adjacent schedules", () => {
    const { chargeSchedules } = replaySheetHistory(months, meterBaseValues);
    const internetSchedules = chargeSchedules
      .filter((s) => s.chargeTypeId === "internet")
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    expect(internetSchedules).toHaveLength(2);
    expect(internetSchedules[0]).toMatchObject({ amount: 5000, validFrom: "2023-10-01", validTo: "2023-10-01" });
    expect(internetSchedules[1]).toMatchObject({ amount: 5500, validFrom: "2023-11-01", validTo: null });
  });

  it("collapses a metered rate change the same way as a fixed schedule", () => {
    const { chargeSchedules } = replaySheetHistory(months, meterBaseValues);
    const elecRateSchedules = chargeSchedules
      .filter((s) => s.chargeTypeId === "electricity" && s.ratePerUnit != null)
      .sort((a, b) => a.validFrom.localeCompare(b.validFrom));
    expect(elecRateSchedules).toHaveLength(2);
    expect(elecRateSchedules[0]).toMatchObject({ ratePerUnit: 40, validFrom: "2023-10-01", validTo: "2023-10-01" });
    expect(elecRateSchedules[1]).toMatchObject({ ratePerUnit: 45, validFrom: "2023-11-01", validTo: null });
  });

  it("keeps a single-month adjustment separate from a bounded recurring one, neither one open-ended", () => {
    // Unlike a rate schedule, an adjustment must never be open-ended
    // (validTo: null) purely for being the last one observed in a finite
    // historical sample — a temporary surcharge must stay bounded to the
    // months it actually covers (see collapseRuns's openEndLastRun doc).
    const { adjustments } = replaySheetHistory(months, meterBaseValues);
    const single = adjustments.find((a) => a.amount === -3000);
    expect(single).toMatchObject({ targetMonth: "2024-02-01", targetMonthEnd: "2024-02-01" });
    const recurring = adjustments.find((a) => a.amount === 2000);
    expect(recurring).toMatchObject({ targetMonth: "2024-05-01", targetMonthEnd: "2024-06-01" });
    expect(adjustments.every((a) => a.targetMonthEnd != null)).toBe(true);
  });

  it("does not merge two equal-valued adjustment episodes across an intervening gap month", () => {
    // Two separate single-month -3000 credits, two months apart (a zero
    // month in between) must stay two separate rows, not one run spanning
    // the gap — this is what the month-adjacency check in collapseRuns
    // guards, distinct from the value-dip case above.
    const gappedMonths = [
      { ...months[0], periodMonth: "2023-10-01", adjustments: [{ amount: -3000, reason: "Other" }] },
      { ...months[0], periodMonth: "2023-11-01", adjustments: [] },
      { ...months[0], periodMonth: "2023-12-01", adjustments: [{ amount: -3000, reason: "Other" }] },
    ];
    const { adjustments } = replaySheetHistory(gappedMonths, meterBaseValues);
    expect(adjustments).toHaveLength(2);
    expect(adjustments.map((a) => a.targetMonth).sort()).toEqual(["2023-10-01", "2023-12-01"]);
  });

  it("anchors the first meter reading to baseValue, not a prior reading", () => {
    const { meters, meterReadings } = replaySheetHistory(months, meterBaseValues);
    const gasMeter = meters.find((m) => m.id === "gas")!;
    expect(gasMeter.baseValue).toBe(0.15);
    expect(gasMeter.installedAt).toBe("2023-10-01");
    const octReading = meterReadings.find((r) => r.meterId === "gas" && r.readingDate === "2023-10-01")!;
    expect(octReading.confirmedValue).toBe(20.15);
  });

  it("reader equivalence: readWorkbookGrid on an in-memory xlsx preserves the same row positions and values as readCsvGrid on equivalent CSV", () => {
    // read-workbook-grid.ts touches the one format that would otherwise
    // ship with zero test coverage (no real XLSX is committed) — build a
    // throwaway workbook in memory via SheetJS's own writer, no file
    // touches disk, nothing committed. Compares row *count* and *position*
    // of the wholly-blank separator row (what `blankrows: true` actually
    // guards — the real layout depends on absolute row indices staying
    // aligned between formats) plus populated-cell values; deliberately
    // doesn't assert byte-identical blank-cell representation, since CSV's
    // "" and XLSX's absent-cell are equally "empty" to toNumber/toDateString.
    const csvGrid = readCsvGrid("a,b,1\nx,y,2\n,,,\nc,d,3\n");
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["a", "b", 1],
      ["x", "y", 2],
      [],
      ["c", "d", 3],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
    const xlsxGrid = readWorkbookGrid(buffer, "Sheet1");

    expect(xlsxGrid.length).toBe(csvGrid.length);
    // Row index 2 (the third row) is the wholly-blank separator in both —
    // this is the position `blankrows: true` must preserve.
    expect(xlsxGrid[2].every((c) => c == null || c === "")).toBe(true);
    expect(csvGrid[2].every((c) => c == null || c === "")).toBe(true);
    // Populated cells: XLSX keeps native numbers, CSV keeps digit strings —
    // both formats' own natural representation, normalized identically by
    // toNumber/toDateString downstream, so compared here after normalizing.
    expect(xlsxGrid[0]).toEqual(["a", "b", 1]);
    expect(csvGrid[0]).toEqual(["a", "b", "1"]);
    expect(xlsxGrid[3]).toEqual(["c", "d", 3]);
    expect(csvGrid[3]).toEqual(["c", "d", "3"]);
  });
});
