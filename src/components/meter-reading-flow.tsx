"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { Check, Clock } from "lucide-react";
import { submitMeterReading } from "@/server/billing/submit-meter-reading";
import { evaluateMeterReadingEntry } from "@/lib/billing/evaluate-meter-reading-entry";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/status-badge";

export interface MeterFlowMeter {
  id: string;
  label: string;
  unit: string;
  previousValue: number;
  previousDate: string | null;
  ratePerUnit: number | null;
  doneThisMonth: boolean;
}

interface Entry {
  value: string;
  photoPath: string | null;
  photoPreviewUrl: string | null;
}

type Step = "list" | "capture" | "value" | "review" | "success";

const VALUE_REGEX = /^\d+([.,]\d{1,3})?$/;

function parseValue(raw: string): number | null {
  if (!VALUE_REGEX.test(raw)) return null;
  return Number(raw.replace(",", "."));
}

function DeltaPill({ delta, unit }: { delta: number; unit: string }) {
  const t = useTranslations("meterReadings");
  const positive = delta >= 0;
  return (
    <span
      className={`inline-flex items-center rounded-4xl border px-2.5 py-0.5 text-xs font-medium tabular-nums ${
        positive ? "border-success-border bg-success-bg text-success" : "border-destructive-border bg-destructive-bg text-destructive"
      }`}
    >
      {t("deltaLabel", { delta: positive ? `+${delta}` : delta, unit })}
    </span>
  );
}

export function MeterReadingFlow({ tenancyId, meters }: { tenancyId: string | null; meters: MeterFlowMeter[] }) {
  const t = useTranslations("meterReadings");
  const format = useFormatter();
  const router = useRouter();
  const [step, setStep] = useState<Step>("list");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, startSubmitting] = useTransition();

  function formatMoney(amount: number) {
    return format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  }

  if (!tenancyId || meters.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("listTitle")}</p>;
  }
  // Narrowed to a stable local so the async submit closure below (defined
  // well after this guard) doesn't see the wider `string | null` prop type.
  const activeTenancyId = tenancyId;

  const doneCount = meters.filter((m) => m.doneThisMonth || entries[m.id] != null).length;
  const current = meters[currentIndex];
  const currentEntry = entries[current.id];

  function startFlow() {
    const firstPending = meters.findIndex((m) => entries[m.id] == null);
    setCurrentIndex(firstPending === -1 ? 0 : firstPending);
    setStep("capture");
  }

  async function handlePhotoSelected(file: File) {
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
      const path = `${activeTenancyId}/${current.id}/${crypto.randomUUID()}.${ext}`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("meter-photos").upload(path, file);
      if (error) throw error;
      setEntries((prev) => ({
        ...prev,
        [current.id]: { value: prev[current.id]?.value ?? "", photoPath: path, photoPreviewUrl: URL.createObjectURL(file) },
      }));
      setStep("value");
    } catch {
      toast.error(t("photoUploadError"));
    } finally {
      setUploading(false);
    }
  }

  function handleSkipPhoto() {
    setEntries((prev) => ({ ...prev, [current.id]: { value: prev[current.id]?.value ?? "", photoPath: null, photoPreviewUrl: null } }));
    setStep("value");
  }

  function goToNext() {
    if (currentIndex + 1 < meters.length) {
      setCurrentIndex(currentIndex + 1);
      setStep("capture");
    } else {
      setStep("review");
    }
  }

  function handleSubmitAll() {
    startSubmitting(async () => {
      const failedLabels: string[] = [];
      for (const meter of meters) {
        const entry = entries[meter.id];
        if (!entry || submittedIds.has(meter.id)) continue;
        const value = parseValue(entry.value);
        if (value == null) continue;
        try {
          await submitMeterReading({
            meterId: meter.id,
            tenancyId: activeTenancyId,
            readingDate: new Date().toISOString().slice(0, 10),
            enteredValue: value,
            photoPath: entry.photoPath ?? undefined,
          });
          setSubmittedIds((prev) => new Set(prev).add(meter.id));
        } catch {
          failedLabels.push(meter.label);
        }
      }
      if (failedLabels.length === 0) {
        toast.success(t("submitSuccessTitle"));
        router.refresh();
        setStep("success");
      } else {
        toast.error(t("partialSubmitError", { failedLabels: failedLabels.join(", ") }));
      }
    });
  }

  if (step === "list") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">{t("listTitle")}</h1>
        <div className="flex flex-col gap-2">
          {meters.map((m) => {
            const done = m.doneThisMonth || entries[m.id] != null;
            return (
              <Card key={m.id} className="flex-row items-center justify-between p-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{m.label}</span>
                  {m.previousDate && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t("meterLastReading", { value: m.previousValue, date: format.dateTime(new Date(`${m.previousDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) })}
                    </span>
                  )}
                </div>
                <StatusPill tone={done ? "success" : "warning"} icon={done ? Check : Clock}>
                  {done ? t("statusDone") : t("statusPending")}
                </StatusPill>
              </Card>
            );
          })}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground tabular-nums">{t("doneCount", { done: doneCount, total: meters.length })}</p>
          <Button type="button" size="lg" onClick={startFlow} disabled={doneCount === meters.length}>
            {t("continueMissing")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "capture") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">{current.label}</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {currentIndex + 1} / {meters.length}
        </p>
        <div className="flex flex-col items-center gap-3 py-8">
          <label className="flex h-19 w-19 items-center justify-center rounded-full border-2 border-primary bg-primary/10 text-sm font-medium">
            {uploading ? "…" : t("takePhoto")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handlePhotoSelected(e.target.files[0])}
            />
          </label>
          <label className="text-sm font-medium text-primary underline">
            {t("uploadFromGallery")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(e) => e.target.files?.[0] && handlePhotoSelected(e.target.files[0])}
            />
          </label>
        </div>
        <Button type="button" variant="outline" onClick={handleSkipPhoto} disabled={uploading}>
          {t("skipPhoto")}
        </Button>
      </div>
    );
  }

  if (step === "value") {
    const rawValue = currentEntry?.value ?? "";
    const parsed = parseValue(rawValue);
    const evaluation =
      parsed != null
        ? evaluateMeterReadingEntry({ enteredValue: parsed, previousValue: current.previousValue, callerRole: "tenant", override: false })
        : null;
    const delta = parsed != null ? parsed - current.previousValue : null;
    const showFormatError = rawValue.length > 0 && parsed == null;

    function setValue(value: string) {
      setEntries((prev) => ({
        ...prev,
        [current.id]: { value, photoPath: prev[current.id]?.photoPath ?? null, photoPreviewUrl: prev[current.id]?.photoPreviewUrl ?? null },
      }));
    }

    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">{t("enterValue")}</h1>
        <p className="text-sm text-muted-foreground tabular-nums">
          {currentIndex + 1} / {meters.length} · {current.label}
        </p>
        {currentEntry?.photoPreviewUrl && (
          <div className="relative h-38 overflow-hidden rounded-md border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentEntry.photoPreviewUrl} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => setStep("capture")} className="absolute right-2 bottom-2 rounded-md bg-background/90 px-2 py-1 text-xs font-medium">
              {t("retake")}
            </button>
          </div>
        )}
        <Card className={`p-4 ${evaluation && !evaluation.allowed ? "border-destructive ring-destructive/30" : ""}`}>
          <Label htmlFor="meter-value">{t("newValueLabel")}</Label>
          <div className="mt-2 flex items-baseline gap-2">
            <Input
              id="meter-value"
              inputMode="decimal"
              autoFocus
              value={rawValue}
              onChange={(e) => setValue(e.target.value)}
              className={`h-14 text-2xl font-semibold tabular-nums ${evaluation && !evaluation.allowed ? "border-destructive" : ""}`}
            />
            <span className="text-sm text-muted-foreground">{current.unit}</span>
          </div>
          {showFormatError && <p className="mt-1 text-sm text-destructive">{t("valueInvalid")}</p>}
          {parsed != null && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted-foreground tabular-nums">{t("previousValueLabel", { value: current.previousValue, unit: current.unit })}</span>
              {delta != null && <DeltaPill delta={delta} unit={current.unit} />}
            </div>
          )}
          {parsed != null && delta != null && delta >= 0 && current.ratePerUnit != null && (
            <p className="mt-2 text-sm tabular-nums">
              {t("estimatedCost", { quantity: delta, rate: formatMoney(current.ratePerUnit), amount: formatMoney(Math.round(delta * current.ratePerUnit)) })}
            </p>
          )}
          {evaluation && !evaluation.allowed && (
            <p className="mt-3 rounded-md border border-destructive-border bg-destructive-bg p-2 text-sm text-destructive">
              {t("errorBelowPrevious", { previous: `${current.previousValue} ${current.unit}` })}
            </p>
          )}
        </Card>
        <Button type="button" size="lg" onClick={goToNext} disabled={parsed == null || (evaluation != null && !evaluation.allowed)}>
          {t("nextMeter")}
        </Button>
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-lg font-semibold">{t("reviewTitle")}</h1>
        <div className="flex flex-col gap-2">
          {meters
            .filter((m) => entries[m.id] != null)
            .map((m) => {
              const entry = entries[m.id];
              const value = parseValue(entry.value);
              const delta = value != null ? value - m.previousValue : null;
              const index = meters.findIndex((meter) => meter.id === m.id);
              return (
                <Card key={m.id} className="flex-row items-center justify-between p-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{t("previousValueLabel", { value: m.previousValue, unit: m.unit })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {delta != null && <DeltaPill delta={delta} unit={m.unit} />}
                    <button
                      type="button"
                      aria-label={m.label}
                      onClick={() => {
                        setCurrentIndex(index);
                        setStep("value");
                      }}
                      className="rounded-md border border-input p-2 text-xs"
                    >
                      ✎
                    </button>
                  </div>
                </Card>
              );
            })}
        </div>
        <p className="rounded-md border border-info-border bg-info-bg p-3 text-sm text-info">{t("reviewNote")}</p>
        <Button type="button" size="lg" onClick={handleSubmitAll} disabled={isSubmitting}>
          {t("submitAllCount", { count: meters.filter((m) => entries[m.id] != null).length })}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex h-18 w-18 items-center justify-center rounded-full border border-success-border bg-success-bg text-success">
        <Check className="size-8" />
      </div>
      <h1 className="text-lg font-semibold">{t("submitSuccessTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("submitSuccessBody")}</p>
      <Card className="w-full p-4 text-left">
        {meters
          .filter((m) => submittedIds.has(m.id))
          .map((m) => (
            <div key={m.id} className="flex items-center justify-between py-1 text-sm tabular-nums">
              <span>{m.label}</span>
              <span className="font-medium">
                {entries[m.id]?.value} {m.unit}
              </span>
            </div>
          ))}
      </Card>
      <Button size="lg" className="w-full" nativeButton={false} render={<Link href="/home" />}>
        {t("backHome")}
      </Button>
    </div>
  );
}
