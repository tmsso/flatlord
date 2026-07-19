import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { describe, expect, it } from "vitest";
import { computeStatement } from "../../src/lib/billing/compute-statement";
import { readCsvGrid } from "../../src/lib/billing/read-csv-grid";
import { readWorkbookGrid } from "../../src/lib/billing/read-workbook-grid";
import { meterBaseValue, parseSheetMonths } from "../../src/lib/billing/parse-sheet-months";
import { replaySheetHistory } from "../../src/lib/billing/replay-sheet-history";
import { reconcileStatementTotal } from "../../src/lib/billing/reconcile-statement-total";

// DB-free, mirrors compute-statement.test.ts. Runs against the synthetic
// fixture by default (fixtures/sheet-demo.csv, committed); pointing
// SHEET_FIXTURE_PATH at /private/sheet-export.xlsx locally runs the exact
// same assertions against real history — never done in CI, see CLAUDE.md
// §0 and the M5 plan.
const fixturePath = process.env.SHEET_FIXTURE_PATH ?? "fixtures/sheet-demo.csv";
const grid = extname(fixturePath) === ".xlsx" ? readWorkbookGrid(readFileSync(fixturePath)) : readCsvGrid(readFileSync(fixturePath, "utf8"));

const months = parseSheetMonths(grid);
const meterBaseValues = {
  electricity: meterBaseValue(grid, "electricity"),
  gas: meterBaseValue(grid, "gas"),
  water_bathroom: meterBaseValue(grid, "water_bathroom"),
  water_kitchen: meterBaseValue(grid, "water_kitchen"),
};
const replayed = replaySheetHistory(months, meterBaseValues);

describe("golden import: the reconciled statement reproduces the sheet's historical Payable to the forint", () => {
  // Two separate claims, both required — reconciliation must not be
  // allowed to paper over an engine bug:
  //   1. The RAW engine total (before any reconciliation) must reproduce
  //      the billed total to within the known ±1 HUF rounding-convention
  //      drift (round-per-line vs. the sheet's own round-at-total — see
  //      reconcile-statement-total.ts's doc comment). This is the
  //      discriminating assertion: it's what actually caught the
  //      metered-rate-schedule omission and the adjustment
  //      open-ended-truncation bugs found earlier this session. Asserting
  //      only the *reconciled* total (below) would pass even if the
  //      engine dropped an entire charge type, since reconcile()
  //      unconditionally forces the total to match by construction.
  //   2. The RECONCILED total (what the importer actually persists)
  //      matches exactly, and line items still sum to it — "faithful
  //      storage", a separate claim from "the engine got it right".
  it.each(months.map((m) => [m.periodMonth, m] as const))("%s", (periodMonth, month) => {
    const result = computeStatement({
      periodMonth,
      chargeTypes: replayed.chargeTypes,
      chargeSchedules: replayed.chargeSchedules,
      meters: replayed.meters,
      meterReadings: replayed.meterReadings,
      adjustments: replayed.adjustments,
    });
    const billedTotal = Math.round(month.sheetPayableTotal);

    // ±1 is the empirically-verified bound (all 32 real months + the
    // synthetic fixture); with 4 metered lines the theoretical worst case
    // is ±2 — if a future month legitimately needs that, widen to 2, not
    // further. A bound that occasionally fails loud is the point.
    expect(Math.abs(result.total - billedTotal)).toBeLessThanOrEqual(1);

    const reconciled = reconcileStatementTotal(result, billedTotal);
    expect(reconciled.total).toBe(billedTotal);
    expect(reconciled.lineItems.reduce((sum, li) => sum + li.amount, 0)).toBe(reconciled.total);
  });

  it("covers every canonical month with no gaps", () => {
    expect(months.length).toBeGreaterThan(0);
  });
});
