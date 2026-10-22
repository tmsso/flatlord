"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Check, CircleDashed, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DepositSection } from "@/components/deposit-section";
import { SKIPPABLE_STEPS, type OffboardingStep, type StepStatus } from "@/lib/offboarding/progress";
import type { ActionResult } from "@/lib/action-result";
import type { OffboardingData } from "@/server/offboarding/load-offboarding";
import { startOffboarding } from "@/server/offboarding/start-offboarding";
import { recordOffboardingStep } from "@/server/offboarding/record-offboarding-step";
import { addProRataCredit } from "@/server/offboarding/add-pro-rata-credit";
import { endTenancy } from "@/server/offboarding/end-tenancy";
import { settleFromDeposit } from "@/server/offboarding/settle-from-deposit";
import { createDraftStatement } from "@/server/billing/create-draft-statement";

// The offboarding checklist (B-43): one card per step, each with its
// status derived from the database (see lib/offboarding/progress.ts) and
// the existing screen or component that resolves it. Nothing is issued or
// ended automatically (D-20) — every money/legal step is the owner's click.
export function OffboardingChecklist({ data, today }: { data: OffboardingData; today: string }) {
  const t = useTranslations("offboarding");
  const tErr = useTranslations("actionErrors");
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const started = data.endDate != null;
  const ended = data.tenancy.status !== "active";

  const money = (n: number) => format.number(n, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const day = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const month = (m: string) => format.dateTime(new Date(`${m}T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" });
  const statusOf = (key: OffboardingStep): StepStatus => data.progress.steps.find((s) => s.key === key)?.status ?? "open";

  // Runs an action; a returned code shows its catalog text, a thrown error the generic one.
  function run(action: () => Promise<ActionResult<object> | void>, onOk?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result && !result.ok) {
          toast.error(tErr(result.error));
          return;
        }
        onOk?.();
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  function step(key: OffboardingStep, body: ReactNode) {
    const status = statusOf(key);
    const index = data.progress.steps.findIndex((s) => s.key === key) + 1;
    return (
      <Card key={key} className="flex flex-col gap-3 p-5" data-step={key} data-status={status}>
        <div className="flex flex-wrap items-center gap-2">
          {status === "done" ? (
            <Check className="size-4 text-success" aria-hidden />
          ) : status === "skipped" ? (
            <SkipForward className="size-4 text-muted-foreground" aria-hidden />
          ) : (
            <CircleDashed className="size-4 text-muted-foreground" aria-hidden />
          )}
          <h2 className="text-base font-semibold">
            {index}. {t(`step_${key}`)}
          </h2>
          <Badge variant="outline">{t(`status_${status}`)}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t(`desc_${key}`)}</p>
        {body}
        {started && !ended && SKIPPABLE_STEPS.includes(key) && status !== "done" && (
          <SkipControl
            stepKey={key}
            status={status}
            note={data.skipNotes[key]}
            disabled={isPending}
            onSkip={(note) => run(() => recordOffboardingStep({ tenancyId: data.tenancy.id, step: key, resolution: "skipped", note }))}
            onReopen={() => run(() => recordOffboardingStep({ tenancyId: data.tenancy.id, step: key, resolution: "reopened" }))}
          />
        )}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("subtitle", { unit: data.tenancy.unitName, tenant: data.tenancy.tenantName })}
        </p>
      </div>

      {step(
        "end",
        <EndDateForm
          endDate={data.endDate}
          defaultDate={today}
          disabled={isPending || ended}
          onSubmit={(endDate) => run(() => startOffboarding({ tenancyId: data.tenancy.id, endDate }))}
        />,
      )}

      {started && (
        <>
          {step(
            "requests",
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {data.requestsModuleOn ? (
                <>
                  <span>{t("openRequests", { count: data.openRequests })}</span>
                  {data.openRequests > 0 && (
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/requests" />}>
                      {t("openRequestsLink")}
                    </Button>
                  )}
                </>
              ) : (
                <span>{t("requestsModuleOff")}</span>
              )}
            </div>,
          )}

          {step(
            "readings",
            <div className="flex flex-col gap-2 text-sm">
              {data.metersMissingFinalReading.length > 0 ? (
                <>
                  <span>{t("metersMissing", { month: month(data.endMonth!), meters: data.metersMissingFinalReading.map((m) => m.label).join(", ") })}</span>
                  <div>
                    <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/meters" />}>
                      {t("openMeters")}
                    </Button>
                  </div>
                </>
              ) : (
                <span>{t("metersAllRead", { month: month(data.endMonth!) })}</span>
              )}
            </div>,
          )}

          {step(
            "statement",
            <div className="flex flex-col gap-3 text-sm">
              {data.proRata && (
                <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                  <span>
                    {t("proRataProposal", {
                      rent: money(data.proRata.rent),
                      days: data.proRata.unusedDays,
                      total: data.proRata.daysInMonth,
                      amount: money(data.proRata.amount),
                    })}
                  </span>
                  <div>
                    <Button size="sm" disabled={isPending} onClick={() => run(() => addProRataCredit({ tenancyId: data.tenancy.id }))}>
                      {t("proRataAdd", { amount: money(data.proRata.amount) })}
                    </Button>
                  </div>
                </div>
              )}
              {data.proRataAdded && <span>{t("proRataAdded")}</span>}
              {!data.endMonthStatement && (
                <div>
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        try {
                          const result = await createDraftStatement({ tenancyId: data.tenancy.id, periodMonth: data.endMonth! });
                          if (!result.ok) toast.error(tErr(result.error));
                          else router.push(`/statements/${result.statementId}`);
                        } catch {
                          toast.error(t("errorGeneric"));
                        }
                      })
                    }
                  >
                    {t("createFinalDraft", { month: month(data.endMonth!) })}
                  </Button>
                </div>
              )}
              {data.endMonthStatement && (
                <div className="flex flex-wrap items-center gap-3">
                  <span>
                    {data.endMonthStatement.status === "draft"
                      ? t("finalDraftExists")
                      : data.endMonthStatement.issuedBeforeStart
                        ? t("statementIssuedBeforeStart")
                        : t("finalStatementIssued")}
                  </span>
                  <Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/statements/${data.endMonthStatement.id}`} />}>
                    {t("openStatement")}
                  </Button>
                </div>
              )}
            </div>,
          )}

          {step(
            "deposit",
            <div className="flex flex-col gap-3 text-sm">
              <span>
                {t("depositSummary", { balance: money(data.depositBalance), outstanding: money(data.outstandingTotal) })}
              </span>
              {data.depositBalance > 0 && data.outstandingTotal > 0 && (
                <div>
                  <Button size="sm" disabled={isPending} onClick={() => run(() => settleFromDeposit({ tenancyId: data.tenancy.id }))}>
                    {t("settleFromDeposit", { amount: money(Math.min(data.depositBalance, data.outstandingTotal)) })}
                  </Button>
                </div>
              )}
              <span className="text-muted-foreground">{t("depositHowTo")}</span>
              <DepositSection tenancyId={data.tenancy.id} transactions={data.depositTransactions} />
            </div>,
          )}

          {step(
            "handover",
            <HandoverForm
              note={data.handoverNote}
              inventoryCount={data.activeInventoryItems}
              tenancyId={data.tenancy.id}
              disabled={isPending || ended}
              onSubmit={(note) => run(() => recordOffboardingStep({ tenancyId: data.tenancy.id, step: "handover", resolution: "done", note }))}
            />,
          )}

          {step(
            "access",
            <div className="flex flex-col gap-2 text-sm">
              {ended ? (
                <span>{t("tenancyEnded", { date: day(data.endDate!) })}</span>
              ) : (
                <>
                  {!data.progress.readyToEnd && <span>{t("endBlocked")}</span>}
                  <div>
                  <EndTenancyDialog
                    disabled={isPending || !data.progress.readyToEnd}
                    message={t("endConfirm", { tenant: data.tenancy.tenantName, date: day(data.endDate!) })}
                    onConfirm={() => run(() => endTenancy({ tenancyId: data.tenancy.id }), () => toast.success(t("endDone")))}
                  />
                  </div>
                </>
              )}
            </div>,
          )}
        </>
      )}
    </div>
  );
}

function EndDateForm({
  endDate,
  defaultDate,
  disabled,
  onSubmit,
}: {
  endDate: string | null;
  defaultDate: string;
  disabled: boolean;
  onSubmit: (endDate: string) => void;
}) {
  const t = useTranslations("offboarding");
  const [value, setValue] = useState(endDate ?? defaultDate);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (value) onSubmit(value);
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="offboardingEndDate">{t("endDateLabel")}</Label>
        <Input id="offboardingEndDate" type="date" value={value} onChange={(e) => setValue(e.target.value)} required />
      </div>
      <Button type="submit" disabled={disabled || !value || value === endDate}>
        {endDate ? t("changeEndDate") : t("start")}
      </Button>
    </form>
  );
}

function SkipControl({
  stepKey,
  status,
  note,
  disabled,
  onSkip,
  onReopen,
}: {
  stepKey: OffboardingStep;
  status: StepStatus;
  note: string | undefined;
  disabled: boolean;
  onSkip: (note: string) => void;
  onReopen: () => void;
}) {
  const t = useTranslations("offboarding");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  if (status === "skipped") {
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">{t("skippedBecause", { note: note ?? "" })}</span>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={onReopen}>
          {t("undoSkip")}
        </Button>
      </div>
    );
  }
  if (!open) {
    return (
      <div>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
          {t("skip")}
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSkip(text.trim());
      }}
    >
      <Label htmlFor={`skip-${stepKey}`}>{t("skipReason")}</Label>
      <Textarea id={`skip-${stepKey}`} value={text} onChange={(e) => setText(e.target.value)} required />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={disabled || !text.trim()}>
          {t("skipConfirm")}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}

function HandoverForm({
  note,
  inventoryCount,
  tenancyId,
  disabled,
  onSubmit,
}: {
  note: string | null;
  inventoryCount: number;
  tenancyId: string;
  disabled: boolean;
  onSubmit: (note: string) => void;
}) {
  const t = useTranslations("offboarding");
  const [text, setText] = useState(note ?? "");
  return (
    <form
      className="flex flex-col gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSubmit(text.trim());
      }}
    >
      <span>
        {t("inventoryCount", { count: inventoryCount })}
        {inventoryCount > 0 && (
          <>
            {" "}
            <Link href={`/tenancies/${tenancyId}`} className="underline">
              {t("openTenancy")}
            </Link>
          </>
        )}
      </span>
      <Label htmlFor="handoverNote">{t("handoverLabel")}</Label>
      <Textarea id="handoverNote" value={text} onChange={(e) => setText(e.target.value)} placeholder={t("handoverPlaceholder")} />
      <div>
        <Button type="submit" size="sm" disabled={disabled || !text.trim() || text.trim() === note}>
          {note ? t("handoverUpdate") : t("handoverRecord")}
        </Button>
      </div>
    </form>
  );
}

function EndTenancyDialog({ disabled, message, onConfirm }: { disabled: boolean; message: string; onConfirm: () => void }) {
  const t = useTranslations("offboarding");
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="destructive" disabled={disabled} />}>{t("endTenancy")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("endTenancy")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm">{message}</p>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            {t("endConfirmButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
