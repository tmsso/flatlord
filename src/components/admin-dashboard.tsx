"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { MonthPicker } from "@/components/ui/month-picker";
import { StatusPill, StatementStatusBadge } from "@/components/status-badge";
import { LifecycleStepper, type LifecycleStep } from "@/components/lifecycle-stepper";
import { MeterConsumptionChart } from "@/components/meter-consumption-chart";
import { MonthlyCostChart } from "@/components/monthly-cost-chart";
import { AlertCircle, Clock, MessageCircle, Wrench } from "lucide-react";
import type { DashboardData, NeedsAttentionKind } from "@/lib/dashboard/get-dashboard-data";

// Same private helper duplicated across statement-detail.tsx / statements-
// list.tsx / tenant-statement-detail.tsx etc. — converts a snake_case
// status into the `status${Capitalized}` i18n key suffix those catalogs use.
function capitalize(s: string): string {
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// design/04 — the real admin dashboard (Phase 4c item 2), replacing the
// two-placeholder-card version. Data is fetched server-side
// (getDashboardData, staged Promise.all per BACKLOG.md B-02) and handed
// here as plain props; this component owns all i18n/formatting, same
// split as TenancyTimeline / CumulativeLedgerChart (Phase 4b).
export function AdminDashboard({
  data,
  today,
  viewMonth,
  previousMonthHref,
  nextMonthHref,
}: {
  data: DashboardData;
  today: string;
  viewMonth: string;
  previousMonthHref: string;
  nextMonthHref: string;
}) {
  const t = useTranslations("dashboard");
  const tNav = useTranslations("nav");
  const tStatements = useTranslations("statements");
  const tRequests = useTranslations("requests");
  const format = useFormatter();
  const router = useRouter();

  const money = (n: number) => format.number(n, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const dateLabel = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const monthLabel = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });
  const daysBetween = (a: string, b: string) => Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);

  const paymentMethodLabel: Record<string, string> = {
    bank_transfer: tStatements("paymentMethodBankTransfer"),
    cash: tStatements("paymentMethodCash"),
    revolut: tStatements("paymentMethodRevolut"),
    other: tStatements("paymentMethodOther"),
  };

  const needsAttentionIcon: Record<NeedsAttentionKind, typeof Clock> = {
    approval: Clock,
    request: MessageCircle,
    inventory: Wrench,
  };
  const needsAttentionLabel: Record<NeedsAttentionKind, string> = {
    approval: t("kindApproval"),
    request: t("kindRequest"),
    inventory: t("kindInventory"),
  };

  const monthPicker = (
    <MonthPicker
      label={monthLabel(viewMonth)}
      onPrevious={() => router.push(previousMonthHref)}
      onNext={() => router.push(nextMonthHref)}
      nextDisabled={viewMonth >= `${today.slice(0, 7)}-01`}
      previousLabel={tNav("dashboard")}
      nextLabel={tNav("dashboard")}
    />
  );

  if (!data.tenancy) {
    return (
      <div className="flex flex-col">
        <PageHeader title={tNav("dashboard")} monthPicker={monthPicker} />
        <div className="flex flex-col gap-4 p-6">
          {data.draftCount > 0 && (
            <Card className="flex flex-col items-start gap-3 p-4 text-sm">
              <p>{t("draftsAwaitingBody", { count: data.draftCount })}</p>
              <Button size="sm" nativeButton={false} render={<Link href="/statements" />}>
                {t("draftsAwaitingCta")}
              </Button>
            </Card>
          )}
          <Card className="p-4 text-sm text-muted-foreground">{t("noActiveTenancy")}</Card>
        </div>
      </div>
    );
  }

  const { tenancy, currentCycle, outstanding, mostOverdue, lastPayment, recentStatements, needsAttention, chart } = data;

  const termEndDays = tenancy.termEnd ? daysBetween(today, tenancy.termEnd) : null;

  const cycleSteps: LifecycleStep[] | null = currentCycle
    ? [
        {
          label: t("readingsStep", { verified: currentCycle.metersVerified, total: currentCycle.metersTotal }),
          dateLabel: null,
          state: currentCycle.metersTotal > 0 && currentCycle.metersVerified >= currentCycle.metersTotal ? "done" : "current",
        },
        {
          label: t("issuedStep"),
          dateLabel: currentCycle.statement?.issuedAt ? dateLabel(currentCycle.statement.issuedAt.slice(0, 10)) : null,
          state: currentCycle.statement && currentCycle.statement.status !== "draft" ? "done" : "pending",
        },
        {
          label: t("paymentStep"),
          dateLabel:
            currentCycle.statement?.status === "paid"
              ? null
              : currentCycle.statement?.overdue
                ? t("paymentStepOverdue", { days: daysBetween(currentCycle.statement.dueDate ?? today, today) })
                : currentCycle.statement?.dueDate
                  ? tStatements("dueDate", { date: dateLabel(currentCycle.statement.dueDate) })
                  : null,
          state:
            currentCycle.statement?.status === "paid"
              ? "done"
              : currentCycle.statement?.overdue
                ? "overdue"
                : currentCycle.statement && currentCycle.statement.status !== "draft"
                  ? "current"
                  : "pending",
        },
      ]
    : null;

  return (
    <div className="flex flex-col">
      <PageHeader title={tNav("dashboard")} monthPicker={monthPicker} />
      <div className="flex flex-col gap-4 p-6">
      {data.draftCount > 0 && (
        <div className="flex items-center gap-3 rounded-md border border-info-border bg-info-bg px-4 py-3 text-[13px]">
          <span className="flex-1">{t("draftsAwaitingBody", { count: data.draftCount })}</span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/statements" />}>
            {t("draftsAwaitingCta")}
          </Button>
        </div>
      )}

      {mostOverdue && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive-border bg-destructive-bg px-4 py-3">
          <AlertCircle className="size-[18px] shrink-0 text-destructive" />
          <div className="flex-1 text-[13px]">
            <b className="font-semibold text-destructive">
              {t("overdueAlertTitle", { month: monthLabel(mostOverdue.periodMonth), days: daysBetween(mostOverdue.dueDate ?? today, today) })}
            </b>{" "}
            — {t("overdueAlertBody", { amount: money(mostOverdue.total), date: mostOverdue.dueDate ? dateLabel(mostOverdue.dueDate) : "—" })}
          </div>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/statements/${mostOverdue.id}`} />}>
            {t("overdueSendReminder")}
          </Button>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`/statements/${mostOverdue.id}`} />}>
            {t("overdueSendWhatsapp")}
          </Button>
          <Button size="sm" variant="destructive" nativeButton={false} render={<Link href="/notices" />}>
            {t("overdueDraftNotice")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_1.4fr_1fr]">
        <Card className="p-4">
          <div className="text-xs font-semibold text-muted-foreground">{t("propertyTenancyLabel")}</div>
          <div className="mt-2 text-[15px] font-semibold">{tenancy.propertyName}</div>
          {tenancy.addressLine && <div className="text-[13px] text-muted-foreground">{tenancy.addressLine}</div>}
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {t("occupantsLine", { name: tenancy.primaryTenantName, count: tenancy.occupantCount })}
          </div>
          {termEndDays != null && (
            <div className="mt-2.5 flex items-center gap-2">
              <StatusPill tone={termEndDays <= 60 ? "warning" : "muted"} icon={Clock}>
                {t("termEndsIn", { days: Math.max(0, termEndDays) })}
              </StatusPill>
              <Link href={`/tenancies/${tenancy.id}`} className="text-[13px] text-primary hover:underline">
                {t("renewContract")}
              </Link>
            </div>
          )}
          <div className="mt-2 text-xs text-muted-foreground tabular-nums">
            {tenancy.contract
              ? t("contractLine", {
                  version: tenancy.contract.version,
                  date: tenancy.contract.termEnd ? dateLabel(tenancy.contract.termEnd) : "—",
                  days: tenancy.contract.noticeDays ?? "—",
                })
              : t("noActiveContract")}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-2.5 text-xs font-semibold text-muted-foreground">
            {currentCycle ? t("billingCycleLabel", { month: monthLabel(currentCycle.periodMonth) }) : ""}
          </div>
          {cycleSteps && <LifecycleStepper steps={cycleSteps} />}
        </Card>

        <Card className="p-4">
          <div className="text-xs font-semibold text-muted-foreground">{t("outstandingLabel")}</div>
          {outstanding ? (
            <>
              <div className="mt-1 text-[28px] font-bold text-destructive tabular-nums">{money(outstanding.totalRemaining)}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("outstandingLine", { count: outstanding.count, date: outstanding.earliestDueDate ? dateLabel(outstanding.earliestDueDate) : "—" })}
              </div>
            </>
          ) : (
            <div className="mt-1 text-[15px] font-semibold text-success">{t("outstandingNone")}</div>
          )}
          <div className="mt-2.5 border-t border-border pt-2.5 text-xs text-muted-foreground tabular-nums">
            {lastPayment
              ? t("lastPaymentLine", { amount: money(lastPayment.amount), date: dateLabel(lastPayment.paidAt), method: paymentMethodLabel[lastPayment.method] ?? lastPayment.method })
              : t("noPaymentsYet")}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-4.5 py-3.5">
            <div className="text-[15px] font-semibold">{t("recentStatementsTitle")}</div>
            <Link href="/statements" className="text-[13px] text-primary hover:underline">
              {t("allStatementsLink")}
            </Link>
          </div>
          {recentStatements.length === 0 ? (
            <p className="px-4.5 py-3 text-[13px] text-muted-foreground">{t("noStatementsYet")}</p>
          ) : (
            <div>
              <div className="grid grid-cols-[1.1fr_1fr_1fr_1fr_1.2fr_auto] gap-2 border-b border-border bg-muted px-4.5 py-2 text-xs font-semibold text-muted-foreground">
                <div>{t("colMonth")}</div>
                <div>{t("colIssued")}</div>
                <div className="text-right">{t("colTotal")}</div>
                <div className="text-right">{t("colPaid")}</div>
                <div>{t("colStatus")}</div>
                <div />
              </div>
              {recentStatements.map((s, i) => {
                const displayStatus = s.overdue ? "overdue" : s.status;
                return (
                  <Link
                    key={s.id}
                    href={`/statements/${s.id}`}
                    className={
                      "grid h-9 grid-cols-[1.1fr_1fr_1fr_1fr_1.2fr_auto] items-center gap-2 px-4.5 text-[13px] tabular-nums outline-none hover:bg-muted focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring " +
                      (i < recentStatements.length - 1 ? "border-b border-border" : "") +
                      (displayStatus === "overdue" ? " bg-[color-mix(in_oklab,var(--destructive)_4%,var(--card))]" : "")
                    }
                  >
                    <div className="font-medium">{monthLabel(s.periodMonth)}</div>
                    <div className="text-muted-foreground">{s.issuedAt ? dateLabel(s.issuedAt.slice(0, 10)) : "—"}</div>
                    <div className="text-right">{money(s.total)}</div>
                    <div className="text-right text-muted-foreground">{s.paidSum > 0 ? money(s.paidSum) : "—"}</div>
                    <div>
                      <StatementStatusBadge status={displayStatus} label={tStatements(`status${capitalize(displayStatus)}`)} />
                    </div>
                    <span className="text-[13px] text-primary">{t("openLink")}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-4.5 py-3.5">
            <div className="text-[15px] font-semibold">{t("needsAttentionTitle")}</div>
            <span className="text-xs text-muted-foreground">{t("needsAttentionCount", { count: needsAttention.length })}</span>
          </div>
          {needsAttention.length === 0 ? (
            <p className="px-4.5 py-3 text-[13px] text-muted-foreground">{t("needsAttentionEmpty")}</p>
          ) : (
            needsAttention.map((item, i) => {
              const Icon = needsAttentionIcon[item.kind];
              return (
                <div
                  key={item.id}
                  className={"flex items-start gap-2.5 px-4.5 py-3" + (i < needsAttention.length - 1 ? " border-b border-border" : "")}
                >
                  <StatusPill tone={item.kind === "approval" ? "warning" : item.kind === "request" ? "info" : "muted"} icon={Icon}>
                    {needsAttentionLabel[item.kind]}
                  </StatusPill>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px]">{item.title}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {item.kind === "request" ? tRequests(`category_${item.subtitle}`) : item.subtitle} · {dateLabel(item.date.slice(0, 10))}
                    </div>
                  </div>
                  <Link href={item.href} className="shrink-0 text-xs text-primary hover:underline">
                    {t("reviewLink")}
                  </Link>
                </div>
              );
            })
          )}
        </Card>
      </div>

      {chart && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="mb-3.5 flex items-center justify-between">
              <div className="text-[15px] font-semibold">{t("consumptionChartTitle")}</div>
              <Link href="/meters" className="text-[13px] text-primary hover:underline">
                {t("utilitiesViewLink")}
              </Link>
            </div>
            {chart.consumptionSeries.length > 0 ? (
              <MeterConsumptionChart months={chart.consumption} series={chart.consumptionSeries} />
            ) : (
              <p className="text-[13px] text-muted-foreground">{t("noStatementsYet")}</p>
            )}
          </Card>
          <Card className="p-4">
            <div className="mb-3.5 text-[15px] font-semibold">{t("costChartTitle")}</div>
            <MonthlyCostChart months={chart.cost} meteredSeries={chart.meteredSeries} />
          </Card>
        </div>
      )}
      </div>
    </div>
  );
}
