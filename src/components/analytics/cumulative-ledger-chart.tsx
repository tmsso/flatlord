"use client";

import { useFormatter, useTranslations } from "next-intl";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import type { CumulativeLedgerPoint } from "@/lib/analytics/compute-cumulative-ledger";

// Phase 4b admin analytics. Cumulative "billed vs received" over the whole
// tenancy — a collections view, admin-only (IDEAS.md forbids showing the
// tenant a running total-paid-to-date). One y-axis, all series in HUF.
export function CumulativeLedgerChart({ points }: { points: CumulativeLedgerPoint[] }) {
  const t = useTranslations("analytics");
  const format = useFormatter();

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const compact = (n: number) =>
    format.number(n, { style: "currency", currency: "HUF", notation: "compact", maximumFractionDigits: 0 });

  if (points.length === 0) {
    return (
      <Card className="p-4">
        <h2 className="mb-1 text-sm font-semibold">{t("ledgerTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("ledgerEmpty")}</p>
      </Card>
    );
  }

  const data = points.map((p) => ({
    month: p.month,
    monthLabel: format.dateTime(new Date(`${p.month}T00:00:00Z`), {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    }),
    billed: p.billed,
    received: p.received,
    outstanding: p.outstanding,
  }));

  const latest = points[points.length - 1];
  const labelFor: Record<string, string> = {
    billed: t("billedLabel"),
    received: t("receivedLabel"),
    outstanding: t("outstandingLabel"),
  };

  return (
    <Card className="p-4">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("ledgerTitle")}</h2>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
            {t("billedLabel")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: "var(--chart-2)" }} />
            {t("receivedLabel")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full opacity-50" style={{ backgroundColor: "var(--chart-rent)" }} />
            {t("outstandingLabel")}
          </span>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        {t("ledgerOutstandingNow", { amount: money(latest.outstanding) })}
      </p>

      <div className="h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="monthLabel"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={{ stroke: "var(--border)" }}
              tickLine={false}
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              axisLine={false}
              tickLine={false}
              width={64}
              tickFormatter={(v) => compact(Number(v))}
            />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value, name) => [money(Number(value)), labelFor[String(name)] ?? String(name)]}
            />
            <Area
              type="monotone"
              dataKey="outstanding"
              stroke="none"
              fill="var(--chart-rent)"
              fillOpacity={0.18}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="billed"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="received"
              stroke="var(--chart-2)"
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
