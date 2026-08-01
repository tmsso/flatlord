"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card } from "@/components/ui/card";
import type { MonthlyCostMonth } from "@/lib/billing/compute-chart-series";

export interface CostSeriesMeta {
  chargeTypeId: string;
  label: string;
  color: string;
}

export function MonthlyCostChart({ months, meteredSeries }: { months: MonthlyCostMonth[]; meteredSeries: CostSeriesMeta[] }) {
  const t = useTranslations("charts");
  const format = useFormatter();

  function formatMoney(amount: number) {
    return format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  }

  const data = months.map((m) => {
    const row: Record<string, string | number> = {
      periodMonth: m.periodMonth,
      monthLabel: format.dateTime(new Date(m.periodMonth + "T00:00:00Z"), { month: "short", timeZone: "UTC" }),
      rent: m.rent,
      fixedOther: m.fixedOther,
      adjustment: m.adjustment,
      total: m.total,
    };
    for (const s of meteredSeries) {
      row[s.chargeTypeId] = m.metered.find((x) => x.chargeTypeId === s.chargeTypeId)?.amount ?? 0;
    }
    return row;
  });

  const labelFor: Record<string, string> = { rent: t("rentLabel"), fixedOther: t("fixedOtherLabel"), adjustment: t("adjustmentLabel") };

  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("costTitle")}</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: "var(--chart-rent)" }} />
            {t("rentLabel")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full opacity-40" style={{ backgroundColor: "var(--chart-1)" }} />
            {t("fixedOtherLabel")}
          </span>
          {meteredSeries.map((s) => (
            <span key={s.chargeTypeId} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: "var(--warning)" }} />
            {t("adjustmentLabel")}
          </span>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">{t("costWidthNote")}</p>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              formatter={(value, name) => [formatMoney(Number(value)), labelFor[String(name)] ?? meteredSeries.find((s) => s.chargeTypeId === name)?.label ?? String(name)]}
              labelFormatter={(_label, payload) => {
                const total = payload?.[0]?.payload?.total;
                return total != null ? `${_label} · ${t("totalLabel")}: ${formatMoney(Number(total))}` : _label;
              }}
            />
            <Bar dataKey="rent" stackId="rent" fill="var(--chart-rent)" radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="fixedOther" stackId="utilities" fill="var(--chart-1)" fillOpacity={0.4} maxBarSize={16} />
            {meteredSeries.map((s) => (
              <Bar key={s.chargeTypeId} dataKey={s.chargeTypeId} stackId="utilities" fill={s.color} maxBarSize={16} />
            ))}
            <Bar dataKey="adjustment" stackId="utilities" fill="var(--warning)" radius={[4, 4, 0, 0]} maxBarSize={16} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
