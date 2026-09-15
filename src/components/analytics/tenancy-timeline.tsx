"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import type { TimelineEvent } from "@/lib/analytics/build-tenancy-timeline";

// Phase 4b admin analytics — one chronological feed of every recorded
// event on a tenancy (statements issued, payments, requests, notices).
// Admin-only; newest first. Ad-hoc notes join this once that 4b bullet's
// design question is settled.
export function TenancyTimeline({ events }: { events: TimelineEvent[] }) {
  const t = useTranslations("analytics");
  const tRequests = useTranslations("requests");
  const tNotices = useTranslations("notices");
  const tStatements = useTranslations("statements");
  const format = useFormatter();

  const money = (n: number) =>
    format.number(n, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const dateLabel = (d: string) =>
    format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const monthLabel = (d: string) =>
    format.dateTime(new Date(`${d}T00:00:00Z`), { month: "long", year: "numeric", timeZone: "UTC" });

  const methodLabel: Record<string, string> = {
    bank_transfer: tStatements("paymentMethodBankTransfer"),
    cash: tStatements("paymentMethodCash"),
    revolut: tStatements("paymentMethodRevolut"),
    other: tStatements("paymentMethodOther"),
  };

  function describe(e: TimelineEvent): { label: string; detail: string } {
    switch (e.type) {
      case "statement_issued":
        return {
          label: t("event_statement_issued"),
          detail: t("eventStatementDetail", {
            period: monthLabel(String(e.data.periodMonth)),
            total: money(Number(e.data.total)),
          }),
        };
      case "payment_recorded":
        return {
          label: t("event_payment_recorded"),
          detail: t("eventPaymentDetail", {
            amount: money(Number(e.data.amount)),
            method: methodLabel[String(e.data.method)] ?? String(e.data.method),
          }),
        };
      case "request_opened":
        return {
          label: t("event_request_opened"),
          detail: t("eventRequestDetail", {
            title: String(e.data.title),
            category: tRequests(`category_${e.data.category}`),
            status: tRequests(`status_${e.data.status}`),
          }),
        };
      case "notice_issued":
        return {
          label: t("event_notice_issued"),
          detail: t("eventNoticeDetail", {
            title: String(e.data.title),
            type: tNotices(`type_${e.data.noticeType}`),
          }),
        };
    }
  }

  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">{t("timelineTitle")}</h2>
      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("timelineEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {events.map((e) => {
            const { label, detail } = describe(e);
            const row = (
              <div className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-medium">{label}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground tabular-figures">
                    {dateLabel(e.date)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{detail}</span>
              </div>
            );
            return (
              <li key={`${e.type}:${e.entityId}`}>
                {e.href ? (
                  <Link href={e.href} className="block rounded-md hover:bg-muted">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
