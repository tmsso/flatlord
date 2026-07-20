"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { StatementStatusBadge, type StatementDisplayStatus } from "@/components/status-badge";
import { StatementLineItemsTable, type StatementLineItemDisplay } from "@/components/statement-line-items-table";
import { deriveStatementDisplayStatus, type StoredStatementStatus } from "@/lib/billing/derive-statement-display-status";
import { cn } from "@/lib/utils";

interface TenantAmountDueProps {
  statement: { id: string; periodMonth: string; status: StoredStatementStatus; dueDate: string | null; total: number } | null;
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

export function TenantAmountDue({ statement, paidSum, lineItems, today }: TenantAmountDueProps) {
  const t = useTranslations("statements");
  const format = useFormatter();
  const [expanded, setExpanded] = useState(false);

  if (!statement) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="text-sm text-muted-foreground">{t("nothingDue")}</div>
      </div>
    );
  }

  // Amount due is the remainder, not the raw total — a partially_paid
  // statement with payments against it would otherwise show double what's
  // actually owed (see the M6 plan's own note on this).
  const amountDue = statement.total - paidSum;
  const displayStatus: StatementDisplayStatus = deriveStatementDisplayStatus(statement.status, statement.dueDate, today);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-card p-6 text-center">
        <div className="text-3xl font-semibold tabular-figures">
          {format.number(amountDue, { style: "currency", currency: "HUF", maximumFractionDigits: 0 })}
        </div>
        <div className="mt-2 flex items-center justify-center gap-2">
          <StatementStatusBadge status={displayStatus} label={t(`status${capitalize(displayStatus)}`)} />
          {statement.dueDate && (
            <span className="text-xs text-muted-foreground">
              {t("dueDate", { date: format.dateTime(new Date(`${statement.dueDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) })}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        {t("howCalculated")}
        <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
      </button>
      {expanded && (
        <div className="rounded-lg border border-border bg-card p-4">
          <StatementLineItemsTable lineItems={lineItems} />
        </div>
      )}
    </div>
  );
}
