import { BASE_VALUE_COL, MONTH_START_COL, ROW, gridRow, toDateString, toNumber, type SheetGrid } from "./sheet-grid";

// First month column (D) is Oct 2023 — a fixed anchor for this one
// property's sheet, not derived from the header row: the header row's date
// representation differs by reader (CSV keeps "Oct 2023" text, XLSX keeps
// an Excel serial number), so deriving periodMonth from column position
// with plain integer month-math avoids format-specific date handling here.
const FIRST_MONTH = { year: 2023, month: 10 };

function periodMonthForColumn(colOffset: number): string {
  const totalMonths = FIRST_MONTH.month - 1 + colOffset;
  const year = FIRST_MONTH.year + Math.floor(totalMonths / 12);
  const month = (totalMonths % 12) + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

export interface SheetMonth {
  periodMonth: string; // "YYYY-MM-01"
  fixedItems: { code: string; amount: number }[];
  meterReadings: { meterCode: string; value: number }[];
  meterRates: { meterCode: string; rate: number }[];
  adjustments: { amount: number; reason: string }[];
  payments: { paidAt: string }[]; // dates only — source has no per-installment amounts, see plan
  sheetPayableTotal: number; // raw fractional value as transcribed — rounding is the caller's job
}

const METERS = [
  { code: "electricity", meterRow: ROW.ELECTRICITY_METER, rateRow: ROW.ELECTRICITY_RATE },
  { code: "gas", meterRow: ROW.GAS_METER, rateRow: ROW.GAS_RATE },
  { code: "water_bathroom", meterRow: ROW.WATER_BATHROOM_METER, rateRow: ROW.WATER_BATHROOM_RATE },
  { code: "water_kitchen", meterRow: ROW.WATER_KITCHEN_METER, rateRow: ROW.WATER_KITCHEN_RATE },
] as const;

export function meterBaseValue(grid: SheetGrid, meterCode: (typeof METERS)[number]["code"]): number {
  const meter = METERS.find((m) => m.code === meterCode);
  if (!meter) throw new Error(`Unknown meter code: ${meterCode}`);
  const base = toNumber(gridRow(grid, meter.meterRow)[BASE_VALUE_COL]);
  if (base == null) throw new Error(`Missing base value for meter ${meterCode}`);
  return base;
}

export function parseSheetMonths(grid: SheetGrid): SheetMonth[] {
  const payableRow = gridRow(grid, ROW.PAYABLE);
  const rentRow = gridRow(grid, ROW.RENT);
  const commonRow = gridRow(grid, ROW.COMMON_COST);
  const internetRow = gridRow(grid, ROW.INTERNET);
  const otherRow = gridRow(grid, ROW.OTHER);
  const datePaidRow = gridRow(grid, ROW.DATE_PAID);
  const datePaidSecondRow = gridRow(grid, ROW.DATE_PAID_SECOND);

  const maxCol = Math.max(payableRow.length, rentRow.length);
  const months: SheetMonth[] = [];

  for (let col = MONTH_START_COL; col < maxCol; col++) {
    const sheetPayableTotal = toNumber(payableRow[col]);
    if (sheetPayableTotal == null) continue; // non-canonical / in-progress column — see plan

    const fixedItems = [
      { code: "rent", amount: toNumber(rentRow[col]) },
      { code: "common_cost", amount: toNumber(commonRow[col]) },
      { code: "internet", amount: toNumber(internetRow[col]) },
    ].filter((item): item is { code: string; amount: number } => item.amount != null);

    const otherAmount = toNumber(otherRow[col]);
    const adjustments =
      otherAmount != null && otherAmount !== 0 ? [{ amount: otherAmount, reason: "Other" }] : [];

    const meterReadings = METERS.map((m) => ({
      meterCode: m.code as string,
      value: toNumber(gridRow(grid, m.meterRow)[col]),
    })).filter((r): r is { meterCode: string; value: number } => r.value != null);

    const meterRates = METERS.map((m) => ({
      meterCode: m.code as string,
      rate: toNumber(gridRow(grid, m.rateRow)[col]),
    })).filter((r): r is { meterCode: string; rate: number } => r.rate != null);

    const payments: { paidAt: string }[] = [];
    const firstDate = toDateString(datePaidRow[col]);
    if (firstDate) payments.push({ paidAt: firstDate });
    const secondDate = toDateString(datePaidSecondRow[col]);
    if (secondDate) payments.push({ paidAt: secondDate });

    months.push({
      periodMonth: periodMonthForColumn(col - MONTH_START_COL),
      fixedItems,
      meterReadings,
      meterRates,
      adjustments,
      payments,
      sheetPayableTotal,
    });
  }

  return months;
}
