"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { issueStatement } from "@/server/billing/issue-statement";
import { recordPayment } from "@/server/billing/record-payment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { LifecycleStepper, type LifecycleStep } from "@/components/lifecycle-stepper";
import { StatementLineItemsTable, type StatementLineItemDisplay } from "@/components/statement-line-items-table";
import { StatementStatusBadge, type StatementDisplayStatus } from "@/components/status-badge";
import { deriveStatementDisplayStatus, type StoredStatementStatus } from "@/lib/billing/derive-statement-display-status";

interface StatementDetailProps {
  statement: {
    id: string;
    periodMonth: string;
    status: StoredStatementStatus;
    dueDate: string | null;
    total: number;
    issuedAt: string | null;
    createdAt: string;
  };
  lineItems: StatementLineItemDisplay[];
  payments: { id: string; amount: number; paidAt: string; method: string; note: string | null }[];
  today: string;
}

const paymentMethods = ["bank_transfer", "cash", "revolut", "other"] as const;

const recordPaymentSchema = z.object({
  // Kept as a validated string, not z.coerce.number() — avoids a
  // zod-v4/react-hook-form generic mismatch between the resolver's input
  // and output types; converted to an integer explicitly in onSubmit.
  amount: z.string().regex(/^\d+$/, "amountInvalid"),
  paidAt: z.string().min(1),
  method: z.enum(paymentMethods),
  note: z.string().optional(),
});
type RecordPaymentForm = z.infer<typeof recordPaymentSchema>;

function capitalize(s: string): string {
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function StatementDetail({ statement, lineItems, payments, today }: StatementDetailProps) {
  const t = useTranslations("statements");
  const format = useFormatter();
  const router = useRouter();
  const [isIssuing, startIssuing] = useTransition();

  const displayStatus: StatementDisplayStatus = deriveStatementDisplayStatus(statement.status, statement.dueDate, today);
  const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = statement.total - paidSum;

  function formatMoney(amount: number) {
    return format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  }
  function formatDate(date: string) {
    return format.dateTime(new Date(`${date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  }

  const steps: LifecycleStep[] = [
    {
      label: t("statusDraft"),
      dateLabel: formatDate(statement.createdAt.slice(0, 10)),
      state: statement.status === "draft" ? "current" : "done",
    },
    {
      label: t("statusIssued"),
      dateLabel: statement.issuedAt ? formatDate(statement.issuedAt.slice(0, 10)) : null,
      state: statement.status === "draft" ? "pending" : statement.status === "paid" ? "done" : "current",
    },
    {
      label: t("statusPaid"),
      dateLabel:
        statement.status === "paid"
          ? formatDate(payments[payments.length - 1]?.paidAt ?? today)
          : statement.dueDate
            ? t("dueDate", { date: formatDate(statement.dueDate) })
            : null,
      state: statement.status === "paid" ? "done" : "pending",
    },
  ];

  function handleIssue() {
    startIssuing(async () => {
      try {
        await issueStatement({ statementId: statement.id });
        toast.success(t("issueSuccess"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">
            {format.dateTime(new Date(`${statement.periodMonth}T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" })}
          </h1>
          <StatementStatusBadge status={displayStatus} label={t(`status${capitalize(displayStatus)}`)} />
        </div>
        {statement.status === "draft" && (
          <Button type="button" onClick={handleIssue} disabled={isIssuing}>
            {t("issue")}
          </Button>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        <LifecycleStepper steps={steps} />
      </div>

      {statement.status !== "draft" && (
        <p className="text-xs text-muted-foreground">{t("issuedInputsLocked")}</p>
      )}

      <StatementLineItemsTable lineItems={lineItems} />

      <div className="rounded-md border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">{t("recordPayment")}</div>
          {statement.status !== "draft" && (
            <RecordPaymentDialog statementId={statement.id} />
          )}
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noPaymentsYet")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div>
                  {formatDate(p.paidAt)} · {t(`paymentMethod${capitalize(p.method)}`)}
                  {p.note && <span className="text-muted-foreground"> · {p.note}</span>}
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

function RecordPaymentDialog({ statementId }: { statementId: string }) {
  const t = useTranslations("statements");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isSubmitting, startSubmitting] = useTransition();
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<RecordPaymentForm>({
    // @hookform/resolvers@5.4.0's zod adapter type-checks an internal zod
    // version literal that doesn't structurally match zod@4.4.3's — a
    // known type-level mismatch between currently-latest versions of both
    // packages (both are already pinned to latest; not fixable by an
    // upgrade), not a runtime issue — verified separately via the
    // Playwright pass that the resolver behaves correctly.
    // @ts-expect-error — see comment above; runtime-correct, type-level-only mismatch.
    resolver: zodResolver(recordPaymentSchema) as Resolver<RecordPaymentForm>,
    defaultValues: { method: "bank_transfer", paidAt: new Date().toISOString().slice(0, 10) },
  });

  function onSubmit(values: RecordPaymentForm) {
    startSubmitting(async () => {
      try {
        await recordPayment({
          statementId,
          amount: Number(values.amount),
          paidAt: values.paidAt,
          method: values.method,
          note: values.note || undefined,
        });
        toast.success(t("paymentSuccess"));
        setOpen(false);
        reset();
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" size="sm" />}>{t("recordPayment")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("recordPayment")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-amount">{t("paymentAmountLabel")}</Label>
            <Input id="payment-amount" type="number" step={1} {...register("amount")} />
            {errors.amount && <p className="text-sm text-destructive">{t("amountInvalid")}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-date">{t("paymentDateLabel")}</Label>
            <Input id="payment-date" type="date" {...register("paidAt")} />
          </div>
          <Controller
            name="method"
            control={control}
            render={({ field }) => (
              <div className="flex flex-col gap-1.5">
                <Label>{t("paymentMethodLabel")}</Label>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {paymentMethods.map((m) => (
                      <SelectItem key={m} value={m}>
                        {t(`paymentMethod${capitalize(m)}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment-note">{t("paymentNoteLabel")}</Label>
            <Textarea id="payment-note" {...register("note")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {t("recordPayment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
