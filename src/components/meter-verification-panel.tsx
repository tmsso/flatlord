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
import { MeterReadingStatusBadge, StatusPill } from "@/components/status-badge";
import { MonthPicker } from "@/components/ui/month-picker";
import { Clock, Gauge, Minus, Plus, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

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
  // charge_types.code — the meter-type icon in the queue.
  kind?: string | null;
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
  address,
  submittedAt,
}: {
  tenancyId: string;
  tenantName: string;
  periodMonth: string;
  meters: AdminMeterRow[];
  address?: string | null;
  submittedAt?: string | null;
}) {
  const t = useTranslations("meterReadings");
  const format = useFormatter();
  const router = useRouter();
  const [zoom, setZoom] = useState(1);
  const [isVerifying, startVerifying] = useTransition();
  const [isRejecting, startRejecting] = useTransition();
  const [isDrafting, startDrafting] = useTransition();
  const confirmedInputRef = useRef<HTMLInputElement>(null);

  const readingInputs: MeterBatchReadingInput[] = useMemo(
    () => meters.flatMap((m) => m.readings.map((r) => ({ id: r.id, meterId: m.id, status: r.status, createdAt: r.createdAt }))),
    [meters],
  );
  const progress = useMemo(() => computeMeterBatchProgress(meters.map((m) => m.id), readingInputs), [meters, readingInputs]);
  // Open on the first meter still waiting for review, not on a meter with
  // nothing submitted.
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const firstPending = meters.findIndex((m) => progress.latestByMeter[m.id]?.status === "submitted");
    return firstPending === -1 ? 0 : firstPending;
  });

  const selected = meters[selectedIndex];
  const selectedReading = selected ? meters.find((m) => m.id === selected.id)!.readings.find((r) => r.id === progress.latestByMeter[selected.id]?.id) : undefined;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmForm>({ resolver: zodResolver(confirmSchema), values: { value: String(selectedReading?.confirmedValue ?? selectedReading?.enteredValue ?? "") } });

  // react-hook-form needs its own ref on the input to write the prefilled
  // value into the DOM; the E shortcut needs one to focus it. Passing ours
  // after {...register()} used to replace RHF's, so the box rendered empty
  // (while submit still sent the entered value) — merge them instead.
  const { ref: registerRef, ...valueField } = register("value");
  function setConfirmedInputRef(el: HTMLInputElement | null) {
    registerRef(el);
    confirmedInputRef.current = el;
  }

  function select(index: number) {
    setSelectedIndex(index);
    setZoom(1);
  }

  function goToMonth(offset: number) {
    const [y, m] = periodMonth.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + offset, 1));
    router.push(`?month=${d.toISOString().slice(0, 7)}`);
  }

  function advanceToNextPending() {
    const nextIndex = meters.findIndex((m, i) => i > selectedIndex && progress.latestByMeter[m.id]?.status === "submitted");
    if (nextIndex !== -1) select(nextIndex);
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
        select(Math.max(0, selectedIndex - 1));
      } else if (e.key === "ArrowDown" && !isTyping) {
        e.preventDefault();
        select(Math.min(meters.length - 1, selectedIndex + 1));
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

  const money = (amount: number) => format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const num = (n: number) => format.number(n, { maximumFractionDigits: 3 });
  const unitLabel = (u: string) => (u === "m3" ? "m³" : u);
  const monthLabel = format.dateTime(new Date(`${periodMonth}-01T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" });
  const statusLabel = (status: string) => t(`status${status.charAt(0).toUpperCase() + status.slice(1)}`);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <h1 className="text-xl font-semibold">{t("queueTitle")}</h1>
            <p className="text-xs text-muted-foreground">
              {submittedAt
                ? t("submittedAtBy", { date: format.dateTime(new Date(submittedAt), { dateStyle: "medium", timeStyle: "short" }), name: tenantName })
                : t("notSubmittedYet")}
              {address && ` · ${address}`}
            </p>
          </div>
          <MonthPicker
            label={monthLabel}
            onPrevious={() => goToMonth(-1)}
            onNext={() => goToMonth(1)}
            previousLabel={t("prevMonth")}
            nextLabel={t("nextMonth")}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-2 w-32 rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-success"
              style={{ width: `${progress.totalCount === 0 ? 0 : (progress.verifiedCount / progress.totalCount) * 100}%` }}
            />
          </div>
          <span className="text-[13px] font-medium tabular-figures">{t("batchProgress", { verified: progress.verifiedCount, total: progress.totalCount })}</span>
          <Button type="button" disabled={!progress.allVerified || isDrafting} onClick={handleDraftStatement}>
            {t("allVerifiedCta", {
              month: format.dateTime(new Date(`${periodMonth}-01T00:00:00Z`), { month: "long", timeZone: "UTC" }),
            })}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col gap-2.5">
          {meters.map((m, i) => {
            const reading = m.readings.find((r) => r.id === progress.latestByMeter[m.id]?.id);
            const isSelected = i === selectedIndex;
            const value = reading ? (reading.confirmedValue ?? reading.enteredValue) : null;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => select(i)}
                aria-current={isSelected}
                className={cn(
                  "flex items-center gap-3 rounded-lg border bg-card p-3 text-left shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  isSelected ? "border-primary border-l-4" : "border-border",
                )}
              >
                {reading?.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={reading.photoUrl} alt="" className="h-12 w-16 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                    <Gauge className="size-4 text-muted-foreground" aria-hidden="true" />
                  </div>
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{m.label}</span>
                  {reading && value != null ? (
                    <span className="text-xs text-muted-foreground tabular-figures">
                      {num(value)} {unitLabel(m.unit)} · Δ {value - m.previousValue >= 0 ? "+" : ""}
                      {num(value - m.previousValue)}
                      {reading.ocrValue != null && (
                        <>
                          {" · "}
                          <span className="rounded-4xl border border-info-border bg-info-bg px-1.5 text-info">
                            AI {num(reading.ocrValue)}
                            {reading.ocrConfidence != null && ` · ${Math.round(reading.ocrConfidence * 100)}%`}
                          </span>
                        </>
                      )}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("statusNotSubmitted")}</span>
                  )}
                </div>
                {reading &&
                  (reading.status === "submitted" ? (
                    <StatusPill tone="warning" icon={Clock}>
                      {isSelected ? t("statusReviewing") : t("statusPending")}
                    </StatusPill>
                  ) : (
                    <MeterReadingStatusBadge status={reading.status} label={statusLabel(reading.status)} />
                  ))}
              </button>
            );
          })}
          <p className="px-1 text-xs text-muted-foreground">{t("aiSlotNote")}</p>
        </div>

        {selected && (
          <Card className="gap-0 overflow-hidden py-0">
            <div className="flex items-center justify-between border-b border-border px-[18px] py-3">
              <h2 className="text-[15px] font-semibold">{selected.label}</h2>
              <div className="flex gap-1.5">
                <Button type="button" variant="outline" size="icon-sm" aria-label={t("zoomIn")} onClick={() => setZoom((z) => Math.min(4, z + 0.5))} disabled={!selectedReading?.photoUrl}>
                  <Plus className="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="icon-sm" aria-label={t("zoomOut")} onClick={() => setZoom((z) => Math.max(1, z - 0.5))} disabled={!selectedReading?.photoUrl || zoom === 1}>
                  <Minus className="size-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="icon-sm" aria-label={t("zoomReset")} onClick={() => setZoom(1)} disabled={zoom === 1}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
            {/* Zoom scales the image inside a scrollable frame, so a zoomed
                photo can be panned with scroll/drag on touchpads. */}
            <div className="h-72 overflow-auto bg-muted">
              {selectedReading?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selectedReading.photoUrl}
                  alt=""
                  style={{ width: `${zoom * 100}%` }}
                  className={cn("max-w-none", zoom === 1 && "h-full w-full object-contain")}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {selectedReading ? t("noPhoto") : t("statusNotSubmitted")}
                </div>
              )}
            </div>

            {selectedReading ? (
              <div className="flex flex-col gap-3 p-[18px]">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">{t("tenantEnteredLabel")}</p>
                    <p className="text-2xl font-semibold tabular-figures">
                      {num(selectedReading.enteredValue)} <span className="text-sm font-normal text-muted-foreground">{unitLabel(selected.unit)}</span>
                    </p>
                  </div>
                  {selectedReading.ocrValue != null ? (
                    <div className="rounded-lg border border-info-border bg-info-bg p-3 text-info">
                      <p className="text-xs">
                        {t("aiProposalLabel")}
                        {selectedReading.ocrConfidence != null && ` · ${t("aiConfidence", { pct: Math.round(selectedReading.ocrConfidence * 100) })}`}
                      </p>
                      <p className="text-2xl font-semibold tabular-figures">
                        {num(selectedReading.ocrValue)} <span className="text-sm font-normal">{unitLabel(selected.unit)}</span>
                      </p>
                    </div>
                  ) : (
                    // Phase 5 slot (design/06), rendered empty until OCR exists.
                    <div className="rounded-lg border border-dashed border-input p-3 text-muted-foreground">
                      <p className="text-xs">{t("aiProposalLabel")}</p>
                      <p className="mt-1 text-sm">{t("aiSlotEmpty")}</p>
                    </div>
                  )}
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">
                      {t("previousLabel", {
                        date: selected.previousDate
                          ? format.dateTime(new Date(`${selected.previousDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })
                          : "—",
                      })}
                    </p>
                    <p className="text-base font-semibold tabular-figures">
                      {num(selected.previousValue)} {unitLabel(selected.unit)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs text-muted-foreground">{t("deltaTile")}</p>
                    {(() => {
                      const delta = selectedReading.enteredValue - selected.previousValue;
                      return (
                        <p className="tabular-figures">
                          <span className={cn("text-base font-semibold", delta >= 0 ? "text-success" : "text-destructive")}>
                            {delta >= 0 ? "+" : ""}
                            {num(delta)} {unitLabel(selected.unit)}
                          </span>
                          {selected.ratePerUnit != null && delta > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {" "}
                              ≈ {money(Math.round(delta * selected.ratePerUnit))} {t("atRate", { rate: money(selected.ratePerUnit) })}
                            </span>
                          )}
                        </p>
                      );
                    })()}
                  </div>
                </div>

                <form onSubmit={handleSubmit(handleVerify)} className="flex flex-col gap-2">
                  <Label htmlFor="confirmed-value">{t("confirmedValueLabel")}</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input id="confirmed-value" inputMode="decimal" {...valueField} ref={setConfirmedInputRef} className="h-11 w-44 text-lg font-semibold tabular-figures" />
                    <span className="text-sm text-muted-foreground">{unitLabel(selected.unit)}</span>
                    <div className="ml-auto flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="border-destructive-border text-destructive hover:bg-destructive-bg"
                        onClick={handleReject}
                        disabled={isRejecting || selectedReading.status !== "submitted"}
                      >
                        {t("askForRetake")}
                      </Button>
                      <Button type="submit" disabled={isVerifying || selectedReading.status !== "submitted"}>
                        {t("verifyAndNext")} ↵
                      </Button>
                    </div>
                  </div>
                  {errors.value && <p className="text-sm text-destructive">{t("valueInvalid")}</p>}
                  <p className="text-xs text-muted-foreground">
                    {t("overrideNote")} {t("keyboardHint")}
                  </p>
                </form>
              </div>
            ) : (
              <p className="p-[18px] text-sm text-muted-foreground">{t("statusNotSubmitted")}</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
