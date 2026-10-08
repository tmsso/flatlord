"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, XAxis } from "recharts";
import type { ConsumptionMonth } from "@/lib/billing/compute-chart-series";

// design/02's home mini-chart: one meter type, last few months, value
// labels on the bars, the latest month in the accent colour. The full
// multi-series chart lives on the meters page ("Details").
export function ConsumptionMiniChart({
  months,
  chargeTypeId,
  label,
  unit,
}: {
  months: ConsumptionMonth[];
  chargeTypeId: string;
  label: string;
  unit: string;
}) {
  const t = useTranslations("tenantHome");
  const format = useFormatter();

  const rows = months.map((m) => ({
    month: format.dateTime(new Date(`${m.periodMonth}T00:00:00Z`), { month: "short", timeZone: "UTC" }),
    value: m.meters.filter((x) => x.chargeTypeId === chargeTypeId).reduce((sum, x) => sum + x.quantity, 0),
  }));

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">
          {label} ({unit === "m3" ? "m³" : unit})
        </h2>
        <Link href="/home/meters" className="text-sm text-primary hover:underline">
          {t("details")}
        </Link>
      </div>
      <div className="h-32">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 16, right: 0, bottom: 0, left: 0 }}>
            <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {rows.map((_, i) => (
                <Cell key={i} fill={i === rows.length - 1 ? "var(--chart-1)" : "color-mix(in oklab, var(--chart-1) 35%, var(--card))"} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                style={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                formatter={(v) => (typeof v === "number" && v > 0 ? format.number(v, { maximumFractionDigits: 1 }) : "")}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
