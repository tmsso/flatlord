"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { recordDepositTransaction } from "@/server/deposits/record-deposit-transaction";
import { computeDepositBalance, type DepositTransactionType } from "@/lib/deposits/compute-deposit-balance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface DepositTransactionRow {
  id: string;
  type: DepositTransactionType;
  amount: number;
  currency: string;
  transactionDate: string;
  note: string | null;
}

const TRANSACTION_TYPES: DepositTransactionType[] = ["paid", "applied", "retained", "refunded"];

export function DepositSection({ tenancyId, transactions }: { tenancyId: string; transactions: DepositTransactionRow[] }) {
  const t = useTranslations("deposits");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<DepositTransactionType>("paid");
  const [isPending, startTransition] = useTransition();

  // Ordered oldest-first for balance computation (order of entry shouldn't
  // actually matter for a pure sum, but it keeps the running total
  // reasoning straightforward if a per-row running balance is ever added).
  const balance = computeDepositBalance(transactions);
  const currency = transactions[0]?.currency ?? "HUF";

  function formatMoney(amount: number, curr: string) {
    return format.number(amount, { style: "currency", currency: curr, maximumFractionDigits: 0 });
  }

  function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const amountRaw = String(data.get("amount") ?? "");
    if (!/^\d+$/.test(amountRaw)) {
      setError(t("amountInvalid"));
      return;
    }
    const transactionDate = String(data.get("transactionDate") ?? "");
    if (!transactionDate) {
      setError(t("transactionDateRequired"));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await recordDepositTransaction({
          tenancyId,
          type,
          amount: Number(amountRaw),
          currency,
          transactionDate,
          note: String(data.get("note") ?? "") || undefined,
        });
        toast.success(tc("save"));
        setOpen(false);
        form.reset();
        setType("paid");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("addTransaction")}</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("addTransaction")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreate} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="depositTransactionType">{t("typeLabel")}</Label>
                <Select value={type} onValueChange={(v) => setType(v as DepositTransactionType)}>
                  <SelectTrigger id="depositTransactionType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRANSACTION_TYPES.map((tt) => (
                      <SelectItem key={tt} value={tt}>
                        {t(`type_${tt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="depositTransactionAmount">{t("amountLabel")}</Label>
                <Input id="depositTransactionAmount" name="amount" type="number" step={1} min={0} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="depositTransactionDate">{t("transactionDateLabel")}</Label>
                <Input id="depositTransactionDate" name="transactionDate" type="date" required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="depositTransactionNote">{t("noteLabel")}</Label>
                <Input id="depositTransactionNote" name="note" type="text" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <DialogFooter>
                <Button type="submit" disabled={isPending}>
                  {tc("save")}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="text-sm font-medium">
          {t("balanceLabel")}: {formatMoney(balance, currency)}
        </div>
        {transactions.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
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
