"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { AlertCircle, Check, ChevronLeft, Clock, Droplet, Flame, Gauge, ImageIcon, Info, Pencil, Zap } from "lucide-react";
import { submitMeterReading } from "@/server/billing/submit-meter-reading";
import { createRequest } from "@/server/requests/create-request";
import { evaluateMeterReadingEntry } from "@/lib/billing/evaluate-meter-reading-entry";
import { createClient } from "@/lib/supabase/client";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/status-badge";
import { cn } from "@/lib/utils";

export interface MeterFlowMeter {
  id: string;
  label: string;
  unit: string;
  previousValue: number;
  previousDate: string | null;
  ratePerUnit: number | null;
  doneThisMonth: boolean;
  // The admin rejected this month's reading ("Ask for retake").
  retakeRequested?: boolean;
  // charge_types.code ("electricity", "gas", "water", …) — picks the icon.
  kind?: string | null;
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

function unitLabel(unit: string): string {
  return unit === "m3" ? "m³" : unit;
}

const KIND_ICON: Record<string, { icon: typeof Zap; tone: string }> = {
  electricity: { icon: Zap, tone: "bg-warning-bg text-warning border-warning-border" },
  gas: { icon: Flame, tone: "bg-destructive-bg text-destructive border-destructive-border" },
  water: { icon: Droplet, tone: "bg-info-bg text-info border-info-border" },
};

function MeterIcon({ kind }: { kind?: string | null }) {
  const config = (kind && KIND_ICON[kind]) || { icon: Gauge, tone: "bg-muted text-muted-foreground border-border" };
  const Icon = config.icon;
  return (
    <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md border", config.tone)} aria-hidden="true">
      <Icon className="size-5" />
    </span>
  );
}

// Header shared by every frame (design/03): 44px back button, title,
// muted subtitle.
function FlowHeader({ title, subtitle, onBack, backHref }: { title: string; subtitle?: string; onBack?: () => void; backHref?: string }) {
  const t = useTranslations("meterReadings");
  const backClass = "flex size-11 shrink-0 items-center justify-center rounded-md border border-border bg-card";
  return (
    <div className="flex items-center gap-3">
      {backHref ? (
        <Link href={backHref} className={backClass} aria-label={t("back")}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Link>
      ) : (
        <button type="button" onClick={onBack} className={backClass} aria-label={t("back")}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground tabular-figures">{subtitle}</p>}
      </div>
    </div>
  );
}

export function MeterReadingFlow({
  tenancyId,
  meters,
  readingWindowLabel,
}: {
  tenancyId: string | null;
  meters: MeterFlowMeter[];
  // Pre-formatted on the server: Intl date-range output differs in
  // invisible spacing between Node's ICU and the browser's, which caused
  // a hydration mismatch when formatted here.
  readingWindowLabel?: string;
}) {
  const t = useTranslations("meterReadings");
  const format = useFormatter();
  const router = useRouter();
  const [step, setStep] = useState<Step>("list");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [isSubmitting, startSubmitting] = useTransition();
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [notedMeterIds, setNotedMeterIds] = useState<Set<string>>(new Set());
  const [isSendingNote, startSendingNote] = useTransition();

  const money = (amount: number) => format.number(amount, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const num = (n: number) => format.number(n, { maximumFractionDigits: 3 });
  const day = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { month: "2-digit", day: "2-digit", timeZone: "UTC" });

  if (!tenancyId || meters.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("listTitle")}</p>;
  }
  // Narrowed to a stable local so the async closures below don't see the
  // wider `string | null` prop type.
  const activeTenancyId = tenancyId;

  const doneCount = meters.filter((m) => m.doneThisMonth || entries[m.id] != null).length;
  const current = meters[currentIndex];
  const currentEntry = entries[current.id];
  const enteredCount = meters.filter((m) => entries[m.id] != null).length;

  function startFlow() {
    const firstPending = meters.findIndex((m) => !m.doneThisMonth && entries[m.id] == null);
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

  // Next meter that still needs a reading this month, else review (or
  // back to the list if nothing was entered). `skippedId` is excluded from
  // the count because its entry removal hasn't re-rendered yet.
  function goToNext(skippedId?: string) {
    setNoteOpen(false);
    setNoteText("");
    const next = meters.findIndex((m, i) => i > currentIndex && !m.doneThisMonth);
    if (next !== -1) {
      setCurrentIndex(next);
      setStep("capture");
      return;
    }
    const remaining = meters.filter((m) => m.id !== skippedId && entries[m.id] != null && parseValue(entries[m.id].value) != null);
    setStep(remaining.length > 0 ? "review" : "list");
  }

  // Error-state escape (design/03 frame 3e): the tenant can't submit a
  // lower-than-previous value — only the admin can override — so instead
  // they message the owner through the existing requests flow (which
  // notifies the owner and gives both sides a thread), then skip this
  // meter for now.
  function handleSendNote(enteredValue: number) {
    startSendingNote(async () => {
      try {
        const facts = t("noteBody", { value: num(enteredValue), previous: num(current.previousValue), unit: unitLabel(current.unit) });
        await createRequest({
          tenancyId: null,
          category: "billing_question",
          title: t("noteTitle", { meter: current.label }),
          description: noteText.trim() ? `${facts}\n\n${noteText.trim()}` : facts,
        });
        setNotedMeterIds((prev) => new Set(prev).add(current.id));
        setNoteOpen(false);
        toast.success(t("noteSent"));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleSkipMeter() {
    setEntries((prev) => {
      const next = { ...prev };
      delete next[current.id];
      return next;
    });
    goToNext(current.id);
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
        <FlowHeader
          title={t("listTitle")}
          subtitle={readingWindowLabel}
          backHref="/home"
        />
        <div className="flex flex-col gap-2">
          {meters.map((m) => {
            const done = m.doneThisMonth || entries[m.id] != null;
            return (
              <Card key={m.id} className="flex-row items-center gap-3 p-3">
                <MeterIcon kind={m.kind} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{m.label}</span>
                  <span className="text-xs text-muted-foreground tabular-figures">
                    {m.previousDate
                      ? t("meterLastReading", { value: `${num(m.previousValue)} ${unitLabel(m.unit)}`, date: day(m.previousDate) })
                      : t("previousValueLabel", { value: num(m.previousValue), unit: unitLabel(m.unit) })}
                  </span>
                </div>
                {m.retakeRequested && entries[m.id] == null ? (
                  <StatusPill tone="destructive" icon={AlertCircle}>
                    {t("statusRetakeRequested")}
                  </StatusPill>
                ) : (
                  <StatusPill tone={done ? "success" : "warning"} icon={done ? Check : Clock}>
                    {done ? t("statusDone") : t("statusPending")}
                  </StatusPill>
                )}
              </Card>
            );
          })}
        </div>
        <div className="mt-2 flex flex-col gap-2">
          <p className="text-center text-sm text-muted-foreground tabular-figures">{t("doneCount", { done: doneCount, total: meters.length })}</p>
          <Button type="button" className="h-[52px] text-base" onClick={startFlow} disabled={doneCount === meters.length}>
            {t("continueMissing")}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "capture") {
    // design/03 frame 2: a camera-style panel with every control in the
    // bottom third for one-handed use — gallery left, shutter centre, skip
    // right. The shutter is the `capture="environment"` file input, which
    // opens the phone's own camera (CLAUDE.md §3.4; a live getUserMedia
    // preview is BACKLOG B-21), so the frame is a guide, not a preview.
    return (
      <div className="flex flex-col gap-3">
        <FlowHeader title={current.label} subtitle={t("stepOf", { current: currentIndex + 1, total: meters.length })} onBack={() => setStep("list")} />
        <div className="flex min-h-[460px] flex-col justify-between rounded-xl bg-[oklch(0.22_0.01_75)] p-4 text-[oklch(0.96_0.005_85)]">
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="h-36 w-full max-w-64 rounded-lg border-2 border-[oklch(0.76_0.095_197)]" aria-hidden="true" />
            <p className="text-sm">{t("alignHint")}</p>
          </div>
          <div className="flex items-center justify-between">
            <label className="flex size-12 cursor-pointer items-center justify-center rounded-md border border-white/25" aria-label={t("galleryLabel")}>
              <ImageIcon className="size-5" aria-hidden="true" />
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handlePhotoSelected(e.target.files[0])}
              />
            </label>
            <label
              className={cn(
                "flex size-[72px] cursor-pointer items-center justify-center rounded-full border-4 border-white/80 bg-[oklch(0.76_0.095_197)]",
                uploading && "animate-pulse",
              )}
              aria-label={t("shutterLabel")}
            >
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => e.target.files?.[0] && handlePhotoSelected(e.target.files[0])}
              />
            </label>
            <button
              type="button"
              onClick={handleSkipPhoto}
              disabled={uploading}
              className="flex h-12 min-w-12 items-center justify-center rounded-md border border-white/25 px-3 text-sm font-medium"
            >
              {t("skipPhoto")}
            </button>
          </div>
        </div>
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
    const blocked = evaluation != null && !evaluation.allowed;
    const noted = notedMeterIds.has(current.id);

    function setValue(value: string) {
      setEntries((prev) => ({
        ...prev,
        [current.id]: { value, photoPath: prev[current.id]?.photoPath ?? null, photoPreviewUrl: prev[current.id]?.photoPreviewUrl ?? null },
      }));
    }

    return (
      <div className="flex flex-col gap-3">
        <FlowHeader
          title={current.label}
          subtitle={t("stepOfValue", { current: currentIndex + 1, total: meters.length })}
          onBack={() => setStep("capture")}
        />
        {currentEntry?.photoPreviewUrl && (
          <div className="relative h-36 overflow-hidden rounded-lg border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={currentEntry.photoPreviewUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => setStep("capture")}
              className="absolute right-2 bottom-2 min-h-9 rounded-md border border-border bg-card px-3 text-xs font-medium"
            >
              {t("retake")}
            </button>
          </div>
        )}
        <Card className="gap-3 p-4">
          <Label htmlFor="meter-value">{t("newValueLabel")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="meter-value"
              inputMode="decimal"
              autoFocus
              value={rawValue}
              onChange={(e) => setValue(e.target.value)}
              aria-invalid={blocked || showFormatError}
              className={cn("h-14 text-2xl font-semibold tabular-figures", blocked && "border-destructive")}
            />
            <span className="text-sm text-muted-foreground">{unitLabel(current.unit)}</span>
          </div>
          {showFormatError && <p className="text-sm text-destructive">{t("valueInvalid")}</p>}
          {parsed != null && !blocked && (
            <>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-muted-foreground tabular-figures">
                  {t("previousValueLabel", { value: num(current.previousValue), unit: unitLabel(current.unit) })}
                </span>
                {delta != null && (
                  <StatusPill tone="success" icon={Check}>
                    {t("deltaLabel", { delta: `+${num(delta)}`, unit: unitLabel(current.unit) })}
                  </StatusPill>
                )}
              </div>
              {delta != null && current.ratePerUnit != null && (
                <p className="text-xs text-muted-foreground tabular-figures">
                  {t("estimatedCost", { quantity: num(delta), rate: money(current.ratePerUnit), amount: money(Math.round(delta * current.ratePerUnit)) })}
                </p>
              )}
            </>
          )}
          {blocked && (
            <div className="flex flex-col gap-2">
              <p className="flex gap-2 rounded-md border border-destructive-border bg-destructive-bg p-3 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("errorBelowPrevious", { previous: `${num(current.previousValue)} ${unitLabel(current.unit)}` })}
              </p>
              {noted ? (
                <p className="flex gap-2 rounded-md border border-info-border bg-info-bg p-3 text-sm text-info">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {t("noteSent")}
                </p>
              ) : noteOpen ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="owner-note">{t("noteLabel")}</Label>
                  <Textarea id="owner-note" value={noteText} placeholder={t("notePlaceholder")} onChange={(e) => setNoteText(e.target.value)} />
                  <Button type="button" variant="outline" className="h-11" onClick={() => handleSendNote(parsed!)} disabled={isSendingNote}>
                    {t("sendNote")}
                  </Button>
                </div>
              ) : (
                <Button type="button" variant="outline" className="h-11" onClick={() => setNoteOpen(true)}>
                  {t("sendNoteToOwner")}
                </Button>
              )}
            </div>
          )}
        </Card>
        {/* ≥ previous blocks continuing (only the admin can override); after
            a note to the owner, the tenant may skip this meter instead. */}
        {blocked && noted ? (
          <Button type="button" className="h-[52px] text-base" onClick={handleSkipMeter}>
            {t("skipMeter")}
          </Button>
        ) : (
          <Button type="button" className="h-[52px] text-base" onClick={() => goToNext()} disabled={parsed == null || blocked}>
            {t("nextMeter")}
          </Button>
        )}
      </div>
    );
  }

  if (step === "review") {
    const reviewMeters = meters.filter((m) => entries[m.id] != null);
    return (
      <div className="flex flex-col gap-3">
        <FlowHeader
          title={t("reviewTitle")}
          subtitle={format.dateTime(new Date(), { dateStyle: "medium" })}
          onBack={() => {
            setCurrentIndex(meters.findIndex((m) => m.id === reviewMeters.at(-1)?.id));
            setStep("value");
          }}
        />
        <div className="flex flex-col gap-2">
          {reviewMeters.map((m) => {
            const entry = entries[m.id];
            const value = parseValue(entry.value);
            const delta = value != null ? value - m.previousValue : null;
            const index = meters.findIndex((meter) => meter.id === m.id);
            return (
              <Card key={m.id} className="flex-row items-center gap-3 p-3">
                {entry.photoPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.photoPreviewUrl} alt="" className="size-12 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <MeterIcon kind={m.kind} />
                )}
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-semibold">{m.label}</span>
                  <span className="text-xs text-muted-foreground tabular-figures">
                    {value != null ? `${num(value)} ${unitLabel(m.unit)}` : "—"} · {t("previousShort", { value: num(m.previousValue) })}
                  </span>
                </div>
                {delta != null && (
                  <StatusPill tone="success" icon={Check}>
                    {t("deltaLabel", { delta: `+${num(delta)}`, unit: "" }).trim()}
                  </StatusPill>
                )}
                <button
                  type="button"
                  aria-label={t("editMeter", { meter: m.label })}
                  onClick={() => {
                    setCurrentIndex(index);
                    setStep("value");
                  }}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md border border-input"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>
              </Card>
            );
          })}
        </div>
        <p className="flex gap-2 rounded-md border border-info-border bg-info-bg p-3 text-xs text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {t("reviewNote")}
        </p>
        <Button type="button" className="h-[52px] text-base" onClick={handleSubmitAll} disabled={isSubmitting || enteredCount === 0}>
          {t("submitAllCount", { count: enteredCount })}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4 py-8 text-center">
      <div className="flex size-18 items-center justify-center rounded-full border border-success-border bg-success-bg text-success">
        <Check className="size-8" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold">{t("submitSuccessTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("submitSuccessBody")}</p>
      <Card className="w-full gap-0 p-4 text-left">
        {meters
          .filter((m) => submittedIds.has(m.id))
          .map((m) => (
            <div key={m.id} className="flex items-center justify-between py-1 text-sm tabular-figures">
              <span>{m.label}</span>
              <span className="font-semibold">
                {num(parseValue(entries[m.id]?.value ?? "") ?? 0)} {unitLabel(m.unit)}
              </span>
            </div>
          ))}
      </Card>
      <Link href="/home" className={cn(buttonVariants(), "h-[52px] w-full text-base")}>
        {t("backHome")}
      </Link>
    </div>
  );
}
