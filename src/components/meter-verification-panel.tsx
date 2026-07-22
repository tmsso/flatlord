"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { verifyMeterReading } from "@/server/billing/verify-meter-reading";
import { rejectMeterReading } from "@/server/billing/reject-meter-reading";
import { createDraftStatement } from "@/server/billing/create-draft-statement";
import { computeMeterBatchProgress, type MeterBatchReadingInput } from "@/lib/billing/compute-meter-batch-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { MeterReadingStatusBadge } from "@/components/status-badge";

export interface AdminMeterReading {
  id: string;
  enteredValue: number;
  confirmedValue: number | null;
  ocrValue: number | null;
  ocrConfidence: number | null;
  status: "submitted" | "verified" | "rejected";
  createdAt: string;
  photoUrl: string | null;
}

export interface AdminMeterRow {
  id: string;
  label: string;
  unit: string;
  previousValue: number;
  previousDate: string | null;
  ratePerUnit: number | null;
  readings: AdminMeterReading[];
}

const VALUE_REGEX = /^\d+([.,]\d{1,3})?$/;
const confirmSchema = z.object({ value: z.string().regex(VALUE_REGEX, "valueInvalid") });
type ConfirmForm = z.infer<typeof confirmSchema>;

export function MeterVerificationPanel({
  tenancyId,
  tenantName,
  periodMonth,
  meters,
}: {
  tenancyId: string;
  tenantName: string;
  periodMonth: string;
  meters: AdminMeterRow[];
}) {
  const t = useTranslations("meterReadings");
  const format = useFormatter();
  const router = useRouter();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isVerifying, startVerifying] = useTransition();
  const [isRejecting, startRejecting] = useTransition();
  const [isDrafting, startDrafting] = useTransition();
  const confirmedInputRef = useRef<HTMLInputElement>(null);

  const readingInputs: MeterBatchReadingInput[] = useMemo(
    () => meters.flatMap((m) => m.readings.map((r) => ({ id: r.id, meterId: m.id, status: r.status, createdAt: r.createdAt }))),
    [meters],
  );
  const progress = useMemo(() => computeMeterBatchProgress(meters.map((m) => m.id), readingInputs), [meters, readingInputs]);

  const selected = meters[selectedIndex];
  const selectedReading = selected ? meters.find((m) => m.id === selected.id)!.readings.find((r) => r.id === progress.latestByMeter[selected.id]?.id) : undefined;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmForm>({ resolver: zodResolver(confirmSchema), values: { value: String(selectedReading?.confirmedValue ?? selectedReading?.enteredValue ?? "") } });

  function advanceToNextPending() {
    const nextIndex = meters.findIndex((m, i) => i > selectedIndex && progress.latestByMeter[m.id]?.status === "submitted");
    if (nextIndex !== -1) setSelectedIndex(nextIndex);
  }

  function handleVerify(values: ConfirmForm) {
    if (!selectedReading) return;
    startVerifying(async () => {
      try {
        await verifyMeterReading({ readingId: selectedReading.id, confirmedValue: Number(values.value.replace(",", ".")) });
        toast.success(t("verifySuccess"));
        router.refresh();
        advanceToNextPending();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleReject() {
    if (!selectedReading) return;
    startRejecting(async () => {
      try {
        await rejectMeterReading({ readingId: selectedReading.id });
        toast.success(t("rejectSuccess"));
        router.refresh();
        advanceToNextPending();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleDraftStatement() {
    startDrafting(async () => {
      try {
        const { statementId } = await createDraftStatement({ tenancyId, periodMonth: `${periodMonth}-01` });
        router.push(`/statements/${statementId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (e.key === "ArrowUp" && !isTyping) {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown" && !isTyping) {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(meters.length - 1, i + 1));
      } else if ((e.key === "e" || e.key === "E") && !isTyping) {
        confirmedInputRef.current?.focus();
      } else if ((e.key === "r" || e.key === "R") && !isTyping) {
        handleReject();
      } else if (e.key === "Enter" && !isTyping) {
        void handleSubmit(handleVerify)();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIndex, meters, selectedReading]);

  function formatMoney(amount: number) {
    return format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{t("queueTitle")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("submittedBy", { name: tenantName, date: format.dateTime(new Date(`${periodMonth}-01T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" }) })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground tabular-nums">{t("batchProgress", { verified: progress.verifiedCount, total: progress.totalCount })}</span>
            <div className="h-2 w-32 rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-success"
                style={{ width: `${progress.totalCount === 0 ? 0 : (progress.verifiedCount / progress.totalCount) * 100}%` }}
              />
            </div>
          </div>
          <Button type="button" disabled={!progress.allVerified || isDrafting} onClick={handleDraftStatement}>
            {t("allVerifiedCta", {
              month: format.dateTime(new Date(`${periodMonth}-01T00:00:00Z`), { month: "long", timeZone: "UTC" }),
            })}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.5fr]">
        <div className="flex flex-col gap-2">
          {meters.map((m, i) => {
            const reading = m.readings.find((r) => r.id === progress.latestByMeter[m.id]?.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedIndex(i)}
                className={`flex items-center gap-3 rounded-md border p-2 text-left ${i === selectedIndex ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card"}`}
              >
                {reading?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reading.photoUrl} alt="" className="h-11 w-16 shrink-0 rounded object-cover" />
                ) : (
                  <div className="h-11 w-16 shrink-0 rounded bg-muted" />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">{m.label}</span>
                  {reading && <span className="text-xs text-muted-foreground tabular-nums">{reading.confirmedValue ?? reading.enteredValue} {m.unit}</span>}
                </div>
                {reading ? (
                  <MeterReadingStatusBadge status={reading.status} label={t(`status${reading.status.charAt(0).toUpperCase() + reading.status.slice(1)}`)} />
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </button>
            );
          })}
        </div>

        {selected && (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">{selected.label}</h2>
            </div>
            {selectedReading?.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selectedReading.photoUrl} alt="" className="mt-3 h-48 w-full rounded-md border border-border object-cover" />
            ) : (
              <div className="mt-3 flex h-48 w-full items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">—</div>
            )}

            {selectedReading ? (
              <>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border p-2">
                    <p className="text-xs text-muted-foreground">{t("tenantEnteredLabel")}</p>
                    <p className="text-lg font-semibold tabular-nums">{selectedReading.enteredValue} {selected.unit}</p>
                  </div>
                  <div className="rounded-md border border-border p-2">
                    <p className="text-xs text-muted-foreground">{t("previousLabel", { date: selected.previousDate ? format.dateTime(new Date(`${selected.previousDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) : "—" })}</p>
                    <p className="text-lg font-semibold tabular-nums">{selected.previousValue} {selected.unit}</p>
                  </div>
                </div>
                {selectedReading.ocrValue != null && (
                  <div className="mt-3 rounded-md border border-info-border bg-info-bg p-2 text-sm text-info">
                    {t("aiProposalLabel")}: {selectedReading.ocrValue} {selected.unit} ·{" "}
                    {selectedReading.ocrConfidence != null && t("aiConfidence", { pct: Math.round(selectedReading.ocrConfidence * 100) })}
                  </div>
                )}
                {selected.ratePerUnit != null && (
                  <p className="mt-3 text-sm tabular-nums text-muted-foreground">
                    {t("deltaWithEstimate", {
                      delta: selectedReading.enteredValue - selected.previousValue,
                      unit: selected.unit,
                      amount: formatMoney(Math.round((selectedReading.enteredValue - selected.previousValue) * selected.ratePerUnit)),
                    })}
                  </p>
                )}

                <form onSubmit={handleSubmit(handleVerify)} className="mt-4 flex flex-col gap-2">
                  <Label htmlFor="confirmed-value">{t("confirmedValueLabel")}</Label>
                  <div className="flex items-center gap-2">
                    <Input id="confirmed-value" inputMode="decimal" {...register("value")} ref={confirmedInputRef} className="h-10 w-32 tabular-nums" />
                    <span className="text-sm text-muted-foreground">{selected.unit}</span>
                  </div>
                  {errors.value && <p className="text-sm text-destructive">{t("valueInvalid")}</p>}
                  <p className="text-xs text-muted-foreground">{t("overrideNote")}</p>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="destructive" onClick={handleReject} disabled={isRejecting || selectedReading.status !== "submitted"}>
                      {t("askForRetake")}
                    </Button>
                    <Button type="submit" disabled={isVerifying || selectedReading.status !== "submitted"}>
                      {t("verifyAndNext")}
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("keyboardHint")}</p>
                </form>
              </>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">—</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
