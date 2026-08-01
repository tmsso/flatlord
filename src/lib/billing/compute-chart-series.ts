// Charts v1 (ROADMAP Phase 1) build entirely from statement_line_items —
// already the billing engine's per-month, per-charge-type breakdown
// (quantity = meter delta, amount = Ft), so this never hardcodes a
// category set (CLAUDE.md §3.3's explicit rule) and never recomputes
// anything the billing engine already computed authoritatively.

export interface LineItemRow {
  periodMonth: string; // statements.period_month, "YYYY-MM-DD"
  chargeTypeId: string;
  chargeTypeCode: string | null;
  chargeTypeName: string;
  chargeTypeKind: "fixed" | "metered" | "tracked_only" | "one_off";
  chargeTypeUnit: string | null;
  meterId: string | null;
  quantity: number | null;
  amount: number;
  isAdjustment: boolean;
}

export interface MonthlyCostMonth {
  periodMonth: string;
  rent: number;
  fixedOther: number;
  metered: { chargeTypeId: string; label: string; amount: number }[];
  adjustment: number;
  total: number;
}

export interface ConsumptionMonth {
  periodMonth: string;
  meters: { chargeTypeId: string; label: string; unit: string; quantity: number }[];
}

function groupByMonth(rows: LineItemRow[], months: string[]): Map<string, LineItemRow[]> {
  const map = new Map<string, LineItemRow[]>(months.map((m) => [m, []]));
  for (const row of rows) {
    const list = map.get(row.periodMonth);
    if (list) list.push(row);
  }
  return map;
}

export function computeMonthlyCostSeries(rows: LineItemRow[], months: string[]): MonthlyCostMonth[] {
  const byMonth = groupByMonth(rows, months);
  return months.map((periodMonth) => {
    const monthRows = byMonth.get(periodMonth) ?? [];
    let rent = 0;
    let fixedOther = 0;
    let adjustment = 0;
    const meteredMap = new Map<string, { chargeTypeId: string; label: string; amount: number }>();

    for (const row of monthRows) {
      if (row.isAdjustment) {
        adjustment += row.amount;
      } else if (row.chargeTypeCode === "rent") {
        rent += row.amount;
      } else if (row.chargeTypeKind === "fixed") {
        fixedOther += row.amount;
      } else if (row.chargeTypeKind === "metered") {
        const existing = meteredMap.get(row.chargeTypeId);
        if (existing) existing.amount += row.amount;
        else meteredMap.set(row.chargeTypeId, { chargeTypeId: row.chargeTypeId, label: row.chargeTypeName, amount: row.amount });
      }
      // tracked_only rows carry amount=0 by construction — never charged.
    }

    const metered = [...meteredMap.values()];
    const total = rent + fixedOther + adjustment + metered.reduce((s, m) => s + m.amount, 0);
    return { periodMonth, rent, fixedOther, metered, adjustment, total };
  });
}

export function computeConsumptionSeries(rows: LineItemRow[], months: string[]): ConsumptionMonth[] {
  const byMonth = groupByMonth(rows, months);
  return months.map((periodMonth) => {
    const monthRows = byMonth.get(periodMonth) ?? [];
    const meterMap = new Map<string, { chargeTypeId: string; label: string; unit: string; quantity: number }>();
    for (const row of monthRows) {
      if ((row.chargeTypeKind !== "metered" && row.chargeTypeKind !== "tracked_only") || row.quantity == null) continue;
      const key = row.chargeTypeId;
      const existing = meterMap.get(key);
      if (existing) existing.quantity += row.quantity;
      else meterMap.set(key, { chargeTypeId: row.chargeTypeId, label: row.chargeTypeName, unit: row.chargeTypeUnit ?? "", quantity: row.quantity });
    }
    return { periodMonth, meters: [...meterMap.values()] };
  });
}

// Last `count` calendar months ending at `endMonth` ("YYYY-MM-DD", day
// irrelevant), oldest first — matches design 07's oldest-to-newest axis.
export function lastNMonths(endMonth: string, count: number): string[] {
  const end = new Date(endMonth + "T00:00:00Z");
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - i, 1));
    months.push(d.toISOString().slice(0, 10));
  }
  return months;
}
