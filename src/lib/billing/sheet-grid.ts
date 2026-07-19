/**
 * Layout of the Google Sheet golden source (Phase 1 M5) — one property, one
 * fixed row/column format, deliberately not generalized (Phase 5's "second
 * property onboarding" is where a data-driven layout would belong).
 *
 * Rows are numbered as they appear in the spreadsheet (1-indexed, matching
 * what you'd see opening the file), converted to 0-indexed array access at
 * the point of use. Column D (index 3) is the first month (Oct 2023);
 * columns increase one per month after that.
 */

export type SheetCell = string | number | null;
export type SheetGrid = SheetCell[][];

export const MONTH_START_COL = 3; // column D

// Row numbers (1-indexed, spreadsheet-visible) for each labeled row.
export const ROW = {
  RENT: 5,
  COMMON_COST: 6,
  INTERNET: 7,
  OTHER: 8,
  ELECTRICITY_METER: 10,
  ELECTRICITY_RATE: 12,
  GAS_METER: 15,
  GAS_RATE: 17,
  WATER_BATHROOM_METER: 20,
  WATER_BATHROOM_RATE: 22,
  WATER_KITCHEN_METER: 25,
  WATER_KITCHEN_RATE: 27,
  PAYABLE: 32,
  DATE_PAID: 33,
  DATE_PAID_SECOND: 34,
} as const;

// Base-value column for meter rows (column C, index 2).
export const BASE_VALUE_COL = 2;

export function gridRow(grid: SheetGrid, oneIndexedRow: number): SheetCell[] {
  return grid[oneIndexedRow - 1] ?? [];
}

export function toNumber(cell: SheetCell): number | null {
  if (cell == null || cell === "") return null;
  if (typeof cell === "number") return cell;
  const cleaned = cell.replace(/,/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

export function toDateString(cell: SheetCell): string | null {
  if (cell == null || cell === "") return null;
  if (typeof cell === "string") return cell.trim() || null;
  // Excel serial date (days since 1899-12-30).
  const epoch = Date.UTC(1899, 11, 30);
  const ms = epoch + cell * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}
