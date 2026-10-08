"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { StatementStatusBadge, type StatementDisplayStatus } from "@/components/status-badge";
import { lineItemLabel, type StatementLineItemDisplay } from "@/components/statement-line-items-table";
import { deriveStatementDisplayStatus, type StoredStatementStatus } from "@/lib/billing/derive-statement-display-status";
import { cn } from "@/lib/utils";

interface TenantAmountDueProps {
  statement: {
    id: string;
    periodMonth: string;
    status: StoredStatementStatus;
    dueDate: string | null;
    issuedAt: string | null;
    total: number;
  } | null;
  paidSum: number;
  lineItems: StatementLineItemDisplay[];
  today: string;
}

function capitalize(s: string): string {
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// design/02 hero: label + status, the amount, due date, and an in-card
// "how it's calculated" expander listing each billable line compactly
// ("Electricity (198 kWh × 72 Ft)") with the statement total.
export function TenantAmountDue({ statement, paidSum, lineItems, today }: TenantAmountDueProps) {
  const t = useTranslations("statements");
  const format = useFormatter();
  const [expanded, setExpanded] = useState(false);

  const money = (amount: number) => format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });

  if (!statement) {
    return (
      <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="text-sm text-muted-foreground">{t("amountDue")}</div>
        <div className="mt-2 text-base font-medium">{t("nothingDue")}</div>
      </div>
    );
  }

  // Amount due is the remainder, not the raw total — a partially_paid
  // statement with payments against it would otherwise show double what's
  // actually owed (see the M6 plan's own note on this).
  const amountDue = statement.total - paidSum;
  const displayStatus: StatementDisplayStatus = deriveStatementDisplayStatus(
    statement.status,
    statement.dueDate,
    today,
    statement.issuedAt,
  );
  const billable = lineItems.filter((li) => li.isBillable);
  const unit = (u: string | null | undefined) => (u === "m3" ? "m³" : (u ?? ""));

  return (
    <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{t("amountDue")}</span>
        <StatementStatusBadge status={displayStatus} label={t(`status${capitalize(displayStatus)}`)} />
      </div>
      <div className="mt-2 text-[30px] font-bold leading-tight tabular-figures">{money(amountDue)}</div>
      {statement.dueDate && (
        <div className="mt-1 text-sm text-muted-foreground tabular-figures">
          {t("dueDate", { date: format.dateTime(new Date(`${statement.dueDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) })}
        </div>
      )}

      <div className="mt-4 overflow-hidden rounded-md border border-border">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 w-full items-center justify-between gap-2 bg-muted px-3 text-left text-sm font-medium hover:brightness-95"
        >
          {t("howCalculated")}
          <ChevronDown className={cn("size-4 shrink-0 transition-transform", expanded && "rotate-180")} aria-hidden="true" />
        </button>
        {expanded && (
          <div className="flex flex-col gap-1.5 px-3 py-3 text-sm">
            {billable.map((li) => (
              <div key={li.id} className="flex justify-between gap-3">
                <span>
                  {lineItemLabel(t, li)}
                  {li.quantity != null && li.unitRate != null && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({format.number(li.quantity, { maximumFractionDigits: 3 })} {unit(li.unit)} × {money(li.unitRate)})
                    </span>
                  )}
                </span>
                <span className="shrink-0 tabular-figures">{money(li.amount)}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 font-semibold">
              <span>{t("expanderTotal")}</span>
              <span className="tabular-figures">{money(statement.total)}</span>
            </div>
            {/* Reconciles the breakdown with the hero amount for a
                partially paid statement. */}
            {paidSum > 0 && (
              <>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>{t("paidSoFar")}</span>
                  <span className="tabular-figures">−{money(paidSum)}</span>
                </div>
                <div className="flex justify-between gap-3 font-semibold">
                  <span>{t("amountDue")}</span>
                  <span className="tabular-figures">{money(amountDue)}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
