"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { computeDepositBalance, type DepositTransactionType } from "@/lib/deposits/compute-deposit-balance";

export interface TenantDepositTransactionRow {
  id: string;
  type: DepositTransactionType;
  amount: number;
  currency: string;
  transactionDate: string;
  note: string | null;
}

// Read-only — tenants never record deposit transactions. RLS
// (tenant_scope_deposit_transactions, migration 0016) already restricts
// this to the caller's own tenancy, this doesn't re-filter.
export function TenantDepositStatus({ transactions }: { transactions: TenantDepositTransactionRow[] }) {
  const t = useTranslations("deposits");
  const format = useFormatter();

  if (transactions.length === 0) return null;

  const balance = computeDepositBalance(transactions);
  const currency = transactions[0]?.currency ?? "HUF";

  function formatMoney(amount: number, curr: string) {
    return format.number(amount, { style: "currency", currency: curr, maximumFractionDigits: 0 });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-sm font-medium">
          {t("balanceLabel")}: {formatMoney(balance, currency)}
        </div>
        {transactions.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{t(`type_${tx.type}`)}</Badge>
                <span className="text-sm font-medium">{formatMoney(tx.amount, tx.currency)}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {format.dateTime(new Date(tx.transactionDate))}
                {tx.note && ` · ${tx.note}`}
              </span>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
