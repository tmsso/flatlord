"use client";

import { useTranslations, useFormatter } from "next-intl";
import { StatementStatusBadge, type StatementDisplayStatus } from "@/components/status-badge";
import { StatementLineItemsTable, type StatementLineItemDisplay } from "@/components/statement-line-items-table";
import { deriveStatementDisplayStatus, type StoredStatementStatus } from "@/lib/billing/derive-statement-display-status";

interface TenantStatementDetailProps {
  statement: { id: string; periodMonth: string; status: StoredStatementStatus; dueDate: string | null; total: number };
  lineItems: StatementLineItemDisplay[];
  payments: { id: string; amount: number; paidAt: string; method: string }[];
  today: string;
}

function capitalize(s: string): string {
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

// Read-only counterpart to StatementDetail (admin) — no issue/record-payment
// actions, since neither server action is reachable by a tenant caller
// (RLS-restricted to owners); reuses the same shared line-items table so
// the two views never drift on how a statement reads.
export function TenantStatementDetail({ statement, lineItems, payments, today }: TenantStatementDetailProps) {
  const t = useTranslations("statements");
  const format = useFormatter();

  const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = statement.total - paidSum;
  const displayStatus: StatementDisplayStatus = deriveStatementDisplayStatus(statement.status, statement.dueDate, today);

  function formatMoney(amount: number) {
    return format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  }
  function formatDate(date: string) {
    return format.dateTime(new Date(`${date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold">
          {format.dateTime(new Date(`${statement.periodMonth}T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" })}
        </h1>
        <StatementStatusBadge status={displayStatus} label={t(`status${capitalize(displayStatus)}`)} />
      </div>

      <StatementLineItemsTable lineItems={lineItems} />

      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 text-sm font-semibold">{t("recordPayment")}</div>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPaymentsYet")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  {formatDate(p.paidAt)} · {t(`paymentMethod${capitalize(p.method)}`)}
                </div>
                <div className="tabular-figures font-medium">{formatMoney(p.amount)}</div>
              </div>
            ))}
            {statement.status === "partially_paid" && (
              <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
                <span>{t("remainingBalance")}</span>
                <span className="tabular-figures">{formatMoney(remaining)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
