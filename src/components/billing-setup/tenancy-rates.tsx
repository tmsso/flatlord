"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { addChargeSchedule } from "@/server/billing-setup/add-charge-schedule";
import { BILLING_SETUP_ERRORS } from "@/lib/billing/charge-presets";
import { useChargeTypeLabel, type ChargeTypeRow } from "@/components/billing-setup/unit-billing-setup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EffectiveDatedTable } from "@/components/ui/effective-dated-table";

export interface ChargeScheduleRow {
  id: string;
  chargeTypeId: string;
  amount: number | null;
  ratePerUnit: number | null;
  validFrom: string;
  validTo: string | null;
}

const showUnit = (u: string | null) => (u === "m3" ? "m³" : (u ?? ""));

/** Last day of the month a date falls in. The engine bills whole months: a
 * rate with valid_to anywhere in a month covers that whole month — and the
 * sheet importer closes historical runs with the month's 1st, the rates UI
 * with its last day. Showing the month end reads right for both. */
function monthEnd(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/** "YYYY-MM" of the month after a "YYYY-MM-01" period. */
function monthAfter(period: string): string {
  const base = new Date(`${period}T00:00:00Z`);
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1)).toISOString().slice(0, 7);
}

// Rates of one tenancy (charge_schedules), per billable charge type of its
// unit — the "negotiated numbers" half of billing setup; the catalog and
// meters live on the unit page. Append-only (lib/billing/rate-change.ts).
export function TenancyRates({
  tenancyId,
  unitId,
  chargeTypes,
  schedules,
  lastBilledPeriod,
  termStart,
  today,
}: {
  tenancyId: string;
  unitId: string;
  chargeTypes: ChargeTypeRow[];
  schedules: ChargeScheduleRow[];
  /** Latest issued statement's period_month — rates can only start after it. */
  lastBilledPeriod: string | null;
  termStart: string;
  today: string;
}) {
  const t = useTranslations("rates");
  const format = useFormatter();
  const router = useRouter();
  const label = useChargeTypeLabel();
  const billable = chargeTypes.filter((c) => c.kind === "fixed" || c.kind === "metered");
  const money = (n: number) => format.number(n, { style: "currency", currency: "HUF", maximumFractionDigits: 0 });
  const date = (d: string) => format.dateTime(new Date(d), { dateStyle: "medium" });
  const monthStart = `${today.slice(0, 7)}-01`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t("title")}</CardTitle>
          {billable.length > 0 && (
            <AddRateDialog
              tenancyId={tenancyId}
              chargeTypes={billable.filter((c) => c.active)}
              // Nothing billed yet → rates may start back at the term start.
              minMonth={lastBilledPeriod ? monthAfter(lastBilledPeriod) : null}
              defaultMonth={lastBilledPeriod ? monthAfter(lastBilledPeriod) : termStart.slice(0, 7)}
              onSaved={() => router.refresh()}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {lastBilledPeriod ? t("introLocked", { period: format.dateTime(new Date(lastBilledPeriod), { year: "numeric", month: "long" }) }) : t("intro")}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {billable.length === 0 && (
          <p className="text-[13px] text-muted-foreground">
            {t("noChargeTypes")}{" "}
            <Link className="text-primary underline-offset-2 hover:underline" href={`/properties/${unitId}`}>
              {t("goToUnit")}
            </Link>
          </p>
        )}
        {billable.map((c) => {
          const rows = schedules
            .filter((s) => s.chargeTypeId === c.id)
            .sort((a, b) => b.validFrom.localeCompare(a.validFrom));
          return (
            <section key={c.id} className="flex flex-col gap-1.5" aria-label={label(c)}>
              <h3 className="text-sm font-semibold">
                {label(c)}
                {c.kind === "metered" && <span className="ml-1 font-normal text-muted-foreground">/ {showUnit(c.unit)}</span>}
              </h3>
              <EffectiveDatedTable
                columns={[
                  { key: "from", header: t("colFrom") },
                  { key: "to", header: t("colTo") },
                  { key: "value", header: c.kind === "fixed" ? t("colAmount") : t("colRate"), align: "right" },
                ]}
                rows={rows.map((s) => ({
                  id: s.id,
                  // Same rule as the engine's pickActiveSchedule for this month.
                  isCurrent: s.validFrom <= monthStart && (s.validTo == null || s.validTo >= monthStart),
                  cells: {
                    from: date(s.validFrom),
                    to: s.validTo ? date(monthEnd(s.validTo)) : t("openEnded"),
                    value:
                      c.kind === "fixed"
                        ? money(s.amount ?? 0)
                        : `${format.number(s.ratePerUnit ?? 0, { style: "currency", currency: "HUF", maximumFractionDigits: 4 })} / ${showUnit(c.unit)}`,
                  },
                }))}
                currentLabel={t("current")}
                emptyLabel={t("noRates")}
              />
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function AddRateDialog({
  tenancyId,
  chargeTypes,
  minMonth,
  defaultMonth,
  onSaved,
  defaultChargeTypeId,
}: {
  tenancyId: string;
  chargeTypes: ChargeTypeRow[];
  /** "YYYY-MM": earliest month a new rate may start (null = no bound). */
  minMonth: string | null;
  defaultMonth: string;
  onSaved: () => void;
  defaultChargeTypeId?: string;
}) {
  const t = useTranslations("rates");
  const tc = useTranslations("common");
  const label = useChargeTypeLabel();
  const [open, setOpen] = useState(false);
  const [chargeTypeId, setChargeTypeId] = useState(defaultChargeTypeId ?? chargeTypes[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selected = chargeTypes.find((c) => c.id === chargeTypeId);

  function errorText(code: string) {
    switch (code) {
      case BILLING_SETUP_ERRORS.periodLocked:
        return t("error_periodLocked");
      case BILLING_SETUP_ERRORS.draftExists:
        return t("error_draftExists");
      case BILLING_SETUP_ERRORS.notAfterExisting:
        return t("error_notAfterExisting");
      case BILLING_SETUP_ERRORS.notBillable:
        return t("error_notBillable");
      default:
        return t("errorGeneric");
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const month = String(data.get("month") ?? "");
    const raw = String(data.get("value") ?? "").trim().replace(/\s/g, "").replace(",", ".");
    const value = Number(raw);
    if (!/^\d{4}-\d{2}$/.test(month)) return setError(t("monthRequired"));
    if (raw === "" || !Number.isFinite(value) || value < 0 || (selected?.kind === "fixed" && !Number.isInteger(value))) {
      return setError(t("valueInvalid"));
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await addChargeSchedule({ tenancyId, chargeTypeId, validFrom: `${month}-01`, value });
        if (!result.ok) return setError(errorText(result.error));
        toast.success(tc("save"));
        setOpen(false);
        onSaved();
      } catch {
        setError(t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setChargeTypeId(defaultChargeTypeId ?? chargeTypes[0]?.id ?? "");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("addRate")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addRate")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rateChargeType">{t("chargeTypeLabel")}</Label>
            <Select value={chargeTypeId} onValueChange={(v) => setChargeTypeId(String(v))} items={Object.fromEntries(chargeTypes.map((c) => [c.id, label(c)]))}>
              <SelectTrigger id="rateChargeType" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chargeTypes.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {label(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rateMonth">{t("fromMonthLabel")}</Label>
            <Input id="rateMonth" name="month" type="month" min={minMonth ?? undefined} defaultValue={defaultMonth} />
            <p className="text-xs text-muted-foreground">{t("fromMonthHint")}</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rateValue">
              {selected?.kind === "metered" ? t("rateLabel", { unit: showUnit(selected.unit) }) : t("amountLabel")}
            </Label>
            <Input id="rateValue" name="value" inputMode="decimal" />
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
  );
}
