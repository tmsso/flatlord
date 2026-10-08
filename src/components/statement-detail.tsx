"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Check, CreditCard, Lock, MessageCircle } from "lucide-react";
import { issueStatement } from "@/server/billing/issue-statement";
import { discardDraftStatement } from "@/server/billing/discard-draft-statement";
import { recordPayment } from "@/server/billing/record-payment";
import { recordWhatsappPrepared } from "@/server/billing/record-whatsapp-prepared";
import { sendAmountDueEmail } from "@/server/notifications/send-amount-due-email";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { StatementStatusBadge, StatusPill, type StatementDisplayStatus } from "@/components/status-badge";
import { deriveStatementDisplayStatus, type StoredStatementStatus } from "@/lib/billing/derive-statement-display-status";

export interface StatementDeliveryDisplay {
  id: string;
  channel: "email" | "whatsapp";
  kind: "amount_due" | "payment_reminder";
  status: "sent" | "failed" | "prepared";
  createdAt: string;
  automatic: boolean;
}

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
  payments: { id: string; amount: number; paidAt: string; method: string; note: string | null; createdAt: string }[];
  deliveries: StatementDeliveryDisplay[];
  today: string;
  waLink: string | null;
  canSendEmail: boolean;
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

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// design/05: header (breadcrumb, title, status + lock badges, actions,
// inline lifecycle) over a two-column body — line items + immutability
// note on the left; payments, delivery log and history on the right.
export function StatementDetail({ statement, lineItems, payments, deliveries, today, waLink, canSendEmail }: StatementDetailProps) {
  const t = useTranslations("statements");
  const format = useFormatter();
  const router = useRouter();
  const [isIssuing, startIssuing] = useTransition();
  const [isSendingEmail, startSendingEmail] = useTransition();
  const [isDiscarding, startDiscarding] = useTransition();

  const displayStatus: StatementDisplayStatus = deriveStatementDisplayStatus(
    statement.status,
    statement.dueDate,
    today,
    statement.issuedAt,
  );
  const isDraft = statement.status === "draft";
  const paidSum = payments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = statement.total - paidSum;

  function formatMoney(amount: number) {
    return format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  }
  function formatDate(date: string) {
    return format.dateTime(new Date(`${date}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  }
  // Timestamps (created/issued) format in the configured time zone, like
  // History below; formatDate is for calendar dates (due/paid), pinned UTC.
  function formatTimestampDate(ts: string) {
    return format.dateTime(new Date(ts), { dateStyle: "medium" });
  }
  function formatDateTime(ts: string) {
    return format.dateTime(new Date(ts), { dateStyle: "medium", timeStyle: "short" });
  }
  const monthLabel = format.dateTime(new Date(`${statement.periodMonth}T00:00:00Z`), {
    year: "numeric",
    month: "long",
    timeZone: "UTC",
  });

  const statusLabel =
    displayStatus === "overdue" && statement.dueDate
      ? t("overdueDays", { days: daysBetween(statement.dueDate, today) })
      : t(`status${capitalize(displayStatus)}`);

  const steps: LifecycleStep[] = [
    {
      label: t("statusDraft"),
      dateLabel: formatTimestampDate(statement.createdAt),
      state: isDraft ? "current" : "done",
    },
    {
      label: t("statusIssued"),
      dateLabel: statement.issuedAt ? formatTimestampDate(statement.issuedAt) : null,
      state: isDraft ? "pending" : statement.status === "paid" ? "done" : "current",
    },
    {
      label: t("statusPaid"),
      dateLabel:
        statement.status === "paid"
          ? formatDate(payments[payments.length - 1]?.paidAt ?? today)
          : statement.dueDate
            ? displayStatus === "overdue"
              ? t("wasDue", { date: formatDate(statement.dueDate) })
              : t("dueDate", { date: formatDate(statement.dueDate) })
            : null,
      state: statement.status === "paid" ? "done" : displayStatus === "overdue" ? "overdue" : "pending",
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

  function handleDiscard() {
    startDiscarding(async () => {
      try {
        await discardDraftStatement({ statementId: statement.id });
        toast.success(t("discardSuccess"));
        router.push("/statements");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleSendEmail() {
    startSendingEmail(async () => {
      try {
        await sendAmountDueEmail({ statementId: statement.id });
        toast.success(t("sendEmailSuccess"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
      // Refresh either way: a failed send is logged too.
      router.refresh();
    });
  }

  // The link itself opens WhatsApp; the log write is fire-and-forget so it
  // never delays or blocks opening the link.
  function handleWhatsappClick() {
    recordWhatsappPrepared({ statementId: statement.id })
      .then(() => router.refresh())
      .catch((err) => console.error("recordWhatsappPrepared failed", err));
  }

  const canSend = !isDraft && (canSendEmail || waLink);
  const sentEmailBefore = deliveries.some((d) => d.channel === "email" && d.kind === "amount_due" && d.status === "sent");

  function deliveryLabel(d: StatementDeliveryDisplay) {
    if (d.channel === "whatsapp") return t("deliveryWhatsapp");
    return d.kind === "payment_reminder" ? t("deliveryPaymentReminder") : t("deliveryAmountDueEmail");
  }

  // Derived from stored timestamps — statements don't record who issued
  // them, so history lists events, not actors.
  const history = [
    { at: statement.createdAt, text: t("historyDrafted") },
    ...(statement.issuedAt ? [{ at: statement.issuedAt, text: t("historyIssued") }] : []),
    ...payments.map((p) => ({ at: p.createdAt, text: t("historyPayment", { amount: formatMoney(p.amount) }) })),
    ...deliveries.map((d) => ({
      at: d.createdAt,
      text: t("historyDelivery", { what: deliveryLabel(d), status: t(`deliveryStatus${capitalize(d.status)}`) }),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <nav className="text-xs text-muted-foreground">
          <Link href="/statements" className="text-primary hover:underline">
            {t("title")}
          </Link>
          <span> / {monthLabel}</span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold">{t("detailTitle", { month: monthLabel })}</h1>
            <StatementStatusBadge status={displayStatus} label={statusLabel} />
            {!isDraft && (
              <StatusPill tone="muted" icon={Lock}>
                {t("issuedInputsLocked")}
              </StatusPill>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isDraft ? (
              <>
                <Button type="button" variant="destructive" onClick={handleDiscard} disabled={isDiscarding || isIssuing}>
                  {t("discardDraft")}
                </Button>
                <Button type="button" onClick={handleIssue} disabled={isIssuing || isDiscarding}>
                  {t("issue")}
                </Button>
              </>
            ) : (
              <>
                {statement.status !== "paid" && <RecordPaymentDialog statementId={statement.id} />}
                {canSendEmail && (
                  <Button type="button" variant="outline" onClick={handleSendEmail} disabled={isSendingEmail}>
                    {t("sendAmountDueEmail")}
                  </Button>
                )}
                {waLink && (
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<a href={waLink} target="_blank" rel="noopener noreferrer" onClick={handleWhatsappClick} />}
                  >
                    {t("whatsapp")}
                  </Button>
                )}
              </>
            )}
            <Button variant="outline" nativeButton={false} render={<a href={`/api/statements/${statement.id}/pdf`} />}>
              {t("pdf")}
            </Button>
          </div>
        </div>
        <LifecycleStepper steps={steps} variant="inline" />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-4">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border py-4">
              <CardTitle>{t("lineItemsTitle")}</CardTitle>
              <CardAction className="self-center text-xs text-muted-foreground">
                {statement.issuedAt
                  ? t("snapshotAt", { date: formatDateTime(statement.issuedAt) })
                  : t("draftRecomputed")}
              </CardAction>
            </CardHeader>
            <StatementLineItemsTable lineItems={lineItems} layout="flush" />
            {!lineItems.some((li) => li.adjustmentId != null) && (
              <div className="border-t border-border px-[18px] py-3">
                <div className="pb-1 text-xs font-semibold text-muted-foreground">{t("lineItemGroup.adjustments")}</div>
                <p className="text-xs text-muted-foreground">{t("adjustmentsNone")}</p>
              </div>
            )}
            <div className="flex items-center justify-between border-t border-border bg-muted px-[18px] py-3.5 text-[15px] font-semibold">
              <span>{t("totalFor", { month: monthLabel })}</span>
              <span className="tabular-figures">{formatMoney(statement.total)}</span>
            </div>
          </Card>
          {!isDraft && (
            <Card className="py-0">
              <CardContent className="flex gap-3 py-4 text-xs text-muted-foreground">
                <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <p>{t("immutableNote")}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border py-4">
              <CardTitle>{t("paymentsTitle")}</CardTitle>
              {!isDraft && (
                <CardAction className={`self-center text-xs font-semibold tabular-figures ${remaining > 0 ? "text-destructive" : "text-success"}`}>
                  {remaining > 0 ? t("openAmount", { amount: formatMoney(remaining) }) : t("settled")}
                </CardAction>
              )}
            </CardHeader>
            {payments.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-[18px] py-6 text-center">
                <div className="flex size-10 items-center justify-center rounded-full border border-border bg-muted">
                  <CreditCard className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="text-sm font-medium">{t("noPaymentsYet")}</p>
                <p className="text-xs text-muted-foreground">{t("paymentsHint")}</p>
                {!isDraft && <RecordPaymentDialog statementId={statement.id} size="sm" />}
              </div>
            ) : (
              <div className="flex flex-col px-[18px] py-3">
                {payments.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-1 text-xs">
                    <span className="w-20 text-muted-foreground tabular-figures">{formatDate(p.paidAt)}</span>
                    <span className="flex-1">
                      {t(`paymentMethod${capitalize(p.method)}`)}
                      {p.note && <span className="text-muted-foreground"> · {p.note}</span>}
                    </span>
                    <span className="font-semibold tabular-figures">{formatMoney(p.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {!isDraft && (
            <Card className="gap-0 py-0">
              <CardHeader className="border-b border-border py-4">
                <CardTitle>{t("deliveryTitle")}</CardTitle>
              </CardHeader>
              {deliveries.length === 0 ? (
                <p className="px-[18px] py-3 text-sm text-muted-foreground">{t("deliveryEmpty")}</p>
              ) : (
                <div className="flex flex-col">
                  {deliveries.map((d, i) => (
                    <div key={d.id} className={`flex items-center gap-3 px-[18px] py-2.5 text-[13px] ${i > 0 ? "border-t border-border" : ""}`}>
                      <StatusPill
                        tone={d.status === "sent" ? "success" : d.status === "failed" ? "destructive" : "muted"}
                        icon={d.status === "sent" ? Check : d.status === "failed" ? AlertCircle : MessageCircle}
                      >
                        {t(`deliveryStatus${capitalize(d.status)}`)}
                      </StatusPill>
                      <span>
                        {deliveryLabel(d)}
                        <span className="text-muted-foreground">
                          {" · "}
                          {formatDateTime(d.createdAt)}
                          {d.automatic && ` (${t("deliveryAuto")})`}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {canSend && (
                <div className="flex flex-col gap-2 border-t border-border px-[18px] py-3">
                  <div className="grid grid-cols-2 gap-2">
                    {waLink && (
                      <Button
                        variant="outline"
                        size="sm"
                        nativeButton={false}
                        render={<a href={waLink} target="_blank" rel="noopener noreferrer" onClick={handleWhatsappClick} />}
                      >
                        {t("sendWhatsapp")}
                      </Button>
                    )}
                    {canSendEmail && (
                      <Button type="button" variant="outline" size="sm" onClick={handleSendEmail} disabled={isSendingEmail}>
                        {sentEmailBefore ? t("resendEmail") : t("sendEmail")}
                      </Button>
                    )}
                  </div>
                  {waLink && <p className="text-[11px] text-muted-foreground">{t("deliveryWhatsappNote")}</p>}
                </div>
              )}
            </Card>
          )}

          <Card className="gap-0 py-0">
            <CardHeader className="border-b border-border py-4">
              <CardTitle>{t("historyTitle")}</CardTitle>
            </CardHeader>
            <ul className="flex flex-col gap-1.5 px-[18px] py-3 text-xs">
              {history.map((h, i) => (
                <li key={i}>
                  {h.text}
                  <span className="text-muted-foreground"> · {formatDateTime(h.at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function RecordPaymentDialog({ statementId, variant = "default", size = "default" }: { statementId: string; variant?: "default" | "outline"; size?: "default" | "sm" }) {
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
    resolver: zodResolver(recordPaymentSchema),
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
      <DialogTrigger render={<Button type="button" variant={variant} size={size} />}>{t("recordPayment")}</DialogTrigger>
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
