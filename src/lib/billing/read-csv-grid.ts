import { parse } from "csv-parse/sync";
import type { SheetGrid } from "./sheet-grid";

// Synthetic-fixture reader (Phase 1 M5) — the fixture stays plain CSV so
// it's diffable/hand-editable in the repo; grid layout (row/column
// positions) matches the real XLSX reader exactly, see sheet-grid.ts.
export function readCsvGrid(csvText: string): SheetGrid {
  return parse(csvText, {
    relax_column_count: true,
    skip_empty_lines: false,
  }) as SheetGrid;
}
