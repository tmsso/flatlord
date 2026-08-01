"use client";

import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Card } from "@/components/ui/card";
import type { ConsumptionMonth } from "@/lib/billing/compute-chart-series";

export interface ConsumptionSeriesMeta {
  chargeTypeId: string;
  label: string;
  unit: string;
  color: string;
}

interface ChartRow {
  periodMonth: string;
  monthLabel: string;
  // one <ChargeTypeId>_pct key per series (0-100, independently scaled to
  // that series' own max across the period — CLAUDE.md/dataviz rule:
  // never a shared/dual y-axis for measures of different units) plus a
  // matching <ChargeTypeId>_raw key the tooltip reads the real value from.
  [key: string]: string | number;
}

export function MeterConsumptionChart({ months, series }: { months: ConsumptionMonth[]; series: ConsumptionSeriesMeta[] }) {
  const t = useTranslations("charts");
  const format = useFormatter();
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selectedMonth, setSelectedMonth] = useState<string | null>(months.at(-1)?.periodMonth ?? null);

  const maxByChargeType = useMemo(() => {
    const max = new Map<string, number>();
    for (const s of series) {
      const values = months.map((m) => m.meters.find((x) => x.chargeTypeId === s.chargeTypeId)?.quantity ?? 0);
      max.set(s.chargeTypeId, Math.max(1, ...values));
    }
    return max;
  }, [months, series]);

  const data: ChartRow[] = months.map((m) => {
    const row: ChartRow = {
      periodMonth: m.periodMonth,
      monthLabel: format.dateTime(new Date(m.periodMonth + "T00:00:00Z"), { month: "short", timeZone: "UTC" }),
    };
    for (const s of series) {
      const q = m.meters.find((x) => x.chargeTypeId === s.chargeTypeId)?.quantity ?? 0;
      row[`${s.chargeTypeId}_raw`] = q;
      row[`${s.chargeTypeId}_pct`] = (q / (maxByChargeType.get(s.chargeTypeId) ?? 1)) * 100;
    }
    return row;
  });

  const selected = months.find((m) => m.periodMonth === selectedMonth) ?? months.at(-1);

  function toggle(chargeTypeId: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(chargeTypeId)) next.delete(chargeTypeId);
      else next.add(chargeTypeId);
      return next;
    });
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("consumptionTitle")}</h2>
        <div className="flex flex-wrap gap-1.5">
          {series.map((s) => (
            <button
              key={s.chargeTypeId}
              type="button"
              onClick={() => toggle(s.chargeTypeId)}
              className="flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium"
              style={{ opacity: hidden.has(s.chargeTypeId) ? 0.4 : 1 }}
              aria-pressed={!hidden.has(s.chargeTypeId)}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barGap={2}
            onClick={(e) => {
              if (e && typeof e.activeLabel === "string") {
                const row = data.find((d) => d.monthLabel === e.activeLabel);
                if (row) setSelectedMonth(row.periodMonth as string);
              }
            }}
          >
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="monthLabel" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              formatter={(_value, _name, item) => {
                const s = series.find((x) => `${x.chargeTypeId}_pct` === item.dataKey);
                if (!s) return [_value, _name];
                const raw = item.payload[`${s.chargeTypeId}_raw`];
                return [`${format.number(Number(raw), { maximumFractionDigits: 1 })} ${s.unit}`, s.label];
              }}
            />
            {series
              .filter((s) => !hidden.has(s.chargeTypeId))
              .map((s) => (
                <Bar key={s.chargeTypeId} dataKey={`${s.chargeTypeId}_pct`} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={28} />
              ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {selected && (
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-sm">
          <span className="font-medium tabular-nums">
            {format.dateTime(new Date(selected.periodMonth + "T00:00:00Z"), { year: "numeric", month: "long", timeZone: "UTC" })}
          </span>
          {series.map((s) => {
            const q = selected.meters.find((m) => m.chargeTypeId === s.chargeTypeId)?.quantity;
            return (
              <span key={s.chargeTypeId} className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
                <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}: <strong className="text-foreground">{q != null ? format.number(q, { maximumFractionDigits: 1 }) : "—"}</strong> {s.unit}
              </span>
            );
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-muted-foreground">{t("consumptionScaleNote")}</p>
    </Card>
  );
}
