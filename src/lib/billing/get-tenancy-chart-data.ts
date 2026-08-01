import type { SupabaseClient } from "@supabase/supabase-js";
import { computeConsumptionSeries, computeMonthlyCostSeries, lastNMonths, type LineItemRow } from "./compute-chart-series";
import { assignChartColors } from "./assign-chart-colors";

export async function getTenancyChartData(supabase: SupabaseClient, tenancyId: string, monthCount: number, endMonth: string) {
  const months = lastNMonths(endMonth, monthCount);

  const { data: statementRows } = await supabase
    .from("statements")
    .select("id, period_month")
    .eq("tenancy_id", tenancyId)
    .gte("period_month", months[0])
    .neq("status", "draft");

  const statementIds = (statementRows ?? []).map((s) => s.id);
  const periodByStatement = new Map((statementRows ?? []).map((s) => [s.id, s.period_month]));

  const { data: lineItemRows } = statementIds.length
    ? await supabase
        .from("statement_line_items")
        .select("statement_id, quantity, amount, adjustment_id, charge_types(id, code, name, kind, unit, sort_order)")
        .in("statement_id", statementIds)
    : { data: [] };

  type ChargeTypeRef = { id: string; code: string | null; name: string; kind: "fixed" | "metered" | "tracked_only" | "one_off"; unit: string | null; sort_order: number };

  const rows: LineItemRow[] = (lineItemRows ?? []).flatMap((li) => {
    const ct = li.charge_types as unknown as ChargeTypeRef | ChargeTypeRef[] | null;
    const c = Array.isArray(ct) ? ct[0] : ct;
    if (!c) return [];
    return [
      {
        periodMonth: periodByStatement.get(li.statement_id) ?? "",
        chargeTypeId: c.id,
        chargeTypeCode: c.code,
        chargeTypeName: c.name,
        chargeTypeKind: c.kind,
        chargeTypeUnit: c.unit,
        meterId: null,
        quantity: li.quantity == null ? null : Number(li.quantity),
        amount: li.amount,
        isAdjustment: li.adjustment_id != null,
      },
    ];
  });

  const consumption = computeConsumptionSeries(rows, months);
  const cost = computeMonthlyCostSeries(rows, months);

  // Stable per-charge-type color, shared across both charts — built from
  // whichever charge types actually appear in this tenancy's own history,
  // never a hardcoded set.
  const chargeTypeById = new Map<string, { name: string; unit: string | null; kind: string; sortOrder: number }>();
  for (const li of lineItemRows ?? []) {
    const ct = li.charge_types as unknown as ChargeTypeRef | ChargeTypeRef[] | null;
    const c = Array.isArray(ct) ? ct[0] : ct;
    if (c && (c.kind === "metered" || c.kind === "tracked_only")) {
      chargeTypeById.set(c.id, { name: c.name, unit: c.unit, kind: c.kind, sortOrder: c.sort_order });
    }
  }
  const colorMap = assignChartColors(
    [...chargeTypeById.entries()].map(([id, c]) => ({ id, kind: c.kind as "metered" | "tracked_only", sortOrder: c.sortOrder })),
  );

  const consumptionSeries = [...chargeTypeById.entries()].map(([id, c]) => ({
    chargeTypeId: id,
    label: c.name,
    unit: c.unit ?? "",
    color: colorMap.get(id) ?? "var(--muted-foreground)",
  }));
  const meteredSeries = consumptionSeries.filter((s) => chargeTypeById.get(s.chargeTypeId)?.kind === "metered");

  return { consumption, cost, consumptionSeries, meteredSeries };
}
