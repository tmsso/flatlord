import * as XLSX from "xlsx";
import type { SheetGrid } from "./sheet-grid";

// Real-source reader (Phase 1 M5) — full-precision numbers, not the
// display-rounded strings a CSV export of the same sheet would carry.
// `blankrows: true` is required, not cosmetic: the sheet has genuine blank
// separator rows between sections, and every row-index constant in
// sheet-grid.ts assumes both readers preserve row positions identically.
export function readWorkbookGrid(buffer: Buffer, sheetName?: string): SheetGrid {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const name = sheetName ?? workbook.SheetNames[0];
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`Sheet "${name}" not found in workbook`);
  return XLSX.utils.sheet_to_json<SheetGrid[number]>(sheet, {
    header: 1,
    raw: true,
    blankrows: true,
  });
}
