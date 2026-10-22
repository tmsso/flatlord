"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { createChargeType } from "@/server/billing-setup/create-charge-type";
import { createMeter } from "@/server/billing-setup/create-meter";
import { retireMeter } from "@/server/billing-setup/retire-meter";
import { replaceMeter } from "@/server/billing-setup/replace-meter";
import {
  BILLING_SETUP_ERRORS,
  CHARGE_PRESETS,
  CUSTOM_CHARGE_KINDS,
  METER_UNITS,
  type ChargePresetCode,
} from "@/lib/billing/charge-presets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ChargeTypeRow {
  id: string;
  code: string | null;
  name: string;
  kind: "fixed" | "metered" | "tracked_only" | "one_off";
  unit: string | null;
  active: boolean;
}

export interface MeterRow {
  id: string;
  label: string;
  chargeTypeId: string;
  baseValue: number;
  installedAt: string;
  removedAt: string | null;
  // B-52: the meter this one replaced, if any (onboarding doesn't load it).
  replacesMeterId?: string | null;
}

const showUnit = (u: string | null) => (u === "m3" ? "m³" : (u ?? ""));

// Server actions return a stable code (BILLING_SETUP_ERRORS) for the cases
// the owner can fix; a thrown error (redacted in production) is shown as
// the generic message.
function useErrorMessage() {
  const t = useTranslations("billingSetup");
  return (err: unknown) => {
    const code = typeof err === "string" ? err : "";
    switch (code) {
      case BILLING_SETUP_ERRORS.duplicateCode:
        return t("error_duplicate");
      case BILLING_SETUP_ERRORS.notMeterable:
        return t("error_notMeterable");
      case BILLING_SETUP_ERRORS.removedBeforeInstalled:
        return t("error_removedBeforeInstalled");
      case BILLING_SETUP_ERRORS.readingsAfterRemoval:
        return t("error_readingsAfterRemoval");
      case BILLING_SETUP_ERRORS.finalRequired:
        return t("error_finalRequired");
      case BILLING_SETUP_ERRORS.finalBelowPrevious:
        return t("error_finalBelowPrevious");
      default:
        return t("errorGeneric");
    }
  };
}

/** A charge type's display name: the catalog entry for a known code, else its stored name. */
export function useChargeTypeLabel() {
  const tStatements = useTranslations("statements");
  return (ct: { code: string | null; name: string }) =>
    ct.code && tStatements.has(`chargeType.${ct.code}`) ? tStatements(`chargeType.${ct.code}`) : ct.name;
}

// Unit-level billing setup (B-42 groundwork): the charge-type catalog and
// the meters of one lettable unit. Rates live on the tenancy page.
export function UnitBillingSetup({
  unitId,
  chargeTypes,
  meters,
}: {
  unitId: string;
  chargeTypes: ChargeTypeRow[];
  meters: MeterRow[];
}) {
  const t = useTranslations("billingSetup");
  const format = useFormatter();
  const router = useRouter();
  const label = useChargeTypeLabel();
  const byId = new Map(chargeTypes.map((c) => [c.id, c]));
  const meterable = chargeTypes.filter((c) => c.active && (c.kind === "metered" || c.kind === "tracked_only"));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <p className="text-xs text-muted-foreground">{t("intro")}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <section className="flex flex-col gap-2" aria-labelledby="charge-types-heading">
          <div className="flex items-center justify-between gap-2">
            <h3 id="charge-types-heading" className="text-sm font-semibold">
              {t("chargeTypesTitle")}
            </h3>
            <AddChargeTypeDialog unitId={unitId} existingCodes={chargeTypes.filter((c) => c.active).map((c) => c.code)} onSaved={() => router.refresh()} />
          </div>
          {chargeTypes.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">{t("noChargeTypes")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead>{t("colKind")}</TableHead>
                  <TableHead>{t("colUnit")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chargeTypes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      {label(c)}
                      {!c.active && (
                        <Badge variant="secondary" className="ml-2">
                          {t("inactive")}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{t(`kind_${c.kind}`)}</TableCell>
                    <TableCell>{showUnit(c.unit)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>

        <section className="flex flex-col gap-2" aria-labelledby="meters-heading">
          <div className="flex items-center justify-between gap-2">
            <h3 id="meters-heading" className="text-sm font-semibold">
              {t("metersTitle")}
            </h3>
            {meterable.length > 0 && <AddMeterDialog unitId={unitId} chargeTypes={meterable} onSaved={() => router.refresh()} />}
          </div>
          {meterable.length === 0 && meters.length === 0 && <p className="text-[13px] text-muted-foreground">{t("noMeterableTypes")}</p>}
          {meterable.length > 0 && meters.length === 0 && <p className="text-[13px] text-muted-foreground">{t("noMeters")}</p>}
          {meters.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("colMeter")}</TableHead>
                  <TableHead>{t("colKind")}</TableHead>
                  <TableHead className="text-right">{t("colBase")}</TableHead>
                  <TableHead>{t("colInstalled")}</TableHead>
                  <TableHead>{t("colStatus")}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {meters.map((m) => {
                  const ct = byId.get(m.chargeTypeId);
                  const replaced = m.replacesMeterId ? meters.find((o) => o.id === m.replacesMeterId) : undefined;
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        {m.label}
                        {replaced && <span className="block text-xs text-muted-foreground">{t("replacesLabel", { label: replaced.label })}</span>}
                      </TableCell>
                      <TableCell>{ct ? label(ct) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {format.number(m.baseValue)} {showUnit(ct?.unit ?? null)}
                      </TableCell>
                      <TableCell>{format.dateTime(new Date(m.installedAt), { dateStyle: "medium" })}</TableCell>
                      <TableCell>
                        {m.removedAt ? (
                          <span className="text-muted-foreground">
                            {t("statusRetired", { date: format.dateTime(new Date(m.removedAt), { dateStyle: "medium" }) })}
                          </span>
                        ) : (
                          t("statusActive")
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {!m.removedAt && (
                          <div className="flex justify-end gap-1">
                            <ReplaceMeterDialog meter={m} onSaved={() => router.refresh()} />
                            <RetireMeterDialog meter={m} onSaved={() => router.refresh()} />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

export function AddChargeTypeDialog({
  unitId,
  existingCodes,
  onSaved,
}: {
  unitId: string;
  existingCodes: (string | null)[];
  onSaved: () => void;
}) {
  const t = useTranslations("billingSetup");
  const tStatements = useTranslations("statements");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const available = CHARGE_PRESETS.filter((p) => !existingCodes.includes(p.code));
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<string>(available[0]?.code ?? "custom");
  const [kind, setKind] = useState<(typeof CUSTOM_CHARGE_KINDS)[number]>("fixed");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const options: Record<string, string> = Object.fromEntries([
    ...available.map((p) => [p.code, tStatements(`chargeType.${p.code}`)]),
    ["custom", t("preset_custom")],
  ]);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (source === "custom" && !name) {
      setError(t("nameRequired"));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        let result: Awaited<ReturnType<typeof createChargeType>>;
        if (source === "custom") {
          const unit = kind === "fixed" ? null : (String(data.get("unit") ?? "kWh") as (typeof METER_UNITS)[number]);
          result = await createChargeType({ source: "custom", unitId, name, kind, unit });
        } else {
          result = await createChargeType({ source: "preset", unitId, code: source as ChargePresetCode });
        }
        if (!result.ok) return setError(errorMessage(result.error));
        toast.success(tc("save"));
        setOpen(false);
        onSaved();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setSource(available[0]?.code ?? "custom");
          setKind("fixed");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("addChargeType")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addChargeType")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chargePreset">{t("presetLabel")}</Label>
            <Select value={source} onValueChange={(v) => setSource(String(v))} items={options}>
              <SelectTrigger id="chargePreset" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(options).map(([value, text]) => (
                  <SelectItem key={value} value={value}>
                    {text}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {source === "custom" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="chargeName">{t("customNameLabel")}</Label>
                <Input id="chargeName" name="name" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="chargeKind">{t("kindLabel")}</Label>
                <Select
                  value={kind}
                  onValueChange={(v) => setKind(v as (typeof CUSTOM_CHARGE_KINDS)[number])}
                  items={Object.fromEntries(CUSTOM_CHARGE_KINDS.map((k) => [k, t(`kind_${k}`)]))}
                >
                  <SelectTrigger id="chargeKind" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CUSTOM_CHARGE_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(`kind_${k}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {kind !== "fixed" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="chargeUnit">{t("unitLabel")}</Label>
                  <Select name="unit" defaultValue="kWh" items={Object.fromEntries(METER_UNITS.map((u) => [u, showUnit(u)]))}>
                    <SelectTrigger id="chargeUnit" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METER_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {showUnit(u)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </>
          )}
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

export function AddMeterDialog({
  unitId,
  chargeTypes,
  onSaved,
}: {
  unitId: string;
  chargeTypes: ChargeTypeRow[];
  onSaved: () => void;
}) {
  const t = useTranslations("billingSetup");
  const tc = useTranslations("common");
  const label = useChargeTypeLabel();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const meterLabel = String(data.get("label") ?? "").trim();
    const baseRaw = String(data.get("baseValue") ?? "").trim().replace(",", ".");
    const baseValue = Number(baseRaw);
    const installedAt = String(data.get("installedAt") ?? "");
    if (!meterLabel) return setError(t("labelRequired"));
    if (baseRaw === "" || !Number.isFinite(baseValue) || baseValue < 0) return setError(t("baseValueInvalid"));
    if (!installedAt) return setError(t("dateRequired"));
    setError(null);
    startTransition(async () => {
      try {
        const result = await createMeter({ unitId, chargeTypeId: String(data.get("chargeTypeId")), label: meterLabel, baseValue, installedAt });
        if (!result.ok) return setError(errorMessage(result.error));
        toast.success(tc("save"));
        setOpen(false);
        onSaved();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("addMeter")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addMeter")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meterChargeType">{t("meterChargeTypeLabel")}</Label>
            <Select
              name="chargeTypeId"
              defaultValue={chargeTypes[0]?.id}
              items={Object.fromEntries(chargeTypes.map((c) => [c.id, label(c)]))}
            >
              <SelectTrigger id="meterChargeType" className="w-full">
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
            <Label htmlFor="meterLabel">{t("meterLabelLabel")}</Label>
            <Input id="meterLabel" name="label" placeholder={t("meterLabelPlaceholder")} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meterBaseValue">{t("baseValueLabel")}</Label>
            <Input id="meterBaseValue" name="baseValue" inputMode="decimal" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="meterInstalledAt">{t("installedAtLabel")}</Label>
            <Input id="meterInstalledAt" name="installedAt" type="date" defaultValue={today} />
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

function RetireMeterDialog({ meter, onSaved }: { meter: MeterRow; onSaved: () => void }) {
  const t = useTranslations("billingSetup");
  const tc = useTranslations("common");
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const removedAt = String(new FormData(e.currentTarget).get("removedAt") ?? "");
    if (!removedAt) return setError(t("dateRequired"));
    setError(null);
    startTransition(async () => {
      try {
        const result = await retireMeter({ meterId: meter.id, removedAt });
        if (!result.ok) return setError(errorMessage(result.error));
        toast.success(tc("save"));
        setOpen(false);
        onSaved();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>{t("retire")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("retireTitle")} — {meter.label}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-[13px] text-muted-foreground">{t("retireHint")}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`retire-${meter.id}`}>{t("removedAtLabel")}</Label>
            <Input id={`retire-${meter.id}`} name="removedAt" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
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

// B-52: one dialog for the whole swap (see replace-meter.ts). When the
// chosen date falls in a month that already has a statement, the server
// answers with the earliest open date; the dialog moves the date there and
// keeps the originally entered one as the physical swap date for the audit
// trail (D-46).
function ReplaceMeterDialog({ meter, onSaved }: { meter: MeterRow; onSaved: () => void }) {
  const t = useTranslations("billingSetup");
  const tc = useTranslations("common");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actualSwapDate, setActualSwapDate] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const parseNumber = (raw: FormDataEntryValue | null) => {
    const text = String(raw ?? "").trim().replace(",", ".");
    if (text === "") return null;
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
  };

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const finalValue = parseNumber(data.get("finalValue"));
    const newBaseValue = parseNumber(data.get("newBaseValue"));
    const newLabel = String(data.get("newLabel") ?? "").trim();
    if (!date) return setError(t("dateRequired"));
    if (!newLabel) return setError(t("labelRequired"));
    if (newBaseValue == null || Number.isNaN(newBaseValue) || Number.isNaN(finalValue)) return setError(t("baseValueInvalid"));
    setError(null);
    startTransition(async () => {
      try {
        const result = await replaceMeter({ meterId: meter.id, replacedAt: date, finalValue, newLabel, newBaseValue, actualSwapDate });
        if (!result.ok) {
          if (result.error === BILLING_SETUP_ERRORS.replacementMonthBilled && result.earliestDate) {
            setActualSwapDate((prev) => prev ?? date);
            setDate(result.earliestDate);
            return setError(
              t("error_replacementMonthBilled", {
                date: format.dateTime(new Date(`${result.earliestDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }),
              }),
            );
          }
          return setError(errorMessage(result.error));
        }
        toast.success(tc("save"));
        setOpen(false);
        onSaved();
      } catch (err) {
        setError(errorMessage(err));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setError(null);
          setDate(new Date().toISOString().slice(0, 10));
          setActualSwapDate(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" />}>{t("replace")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("replaceTitle")} — {meter.label}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <p className="text-[13px] text-muted-foreground">{t("replaceHint")}</p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`replace-date-${meter.id}`}>{t("replacedAtLabel")}</Label>
            <Input id={`replace-date-${meter.id}`} name="replacedAt" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`replace-final-${meter.id}`}>{t("finalValueLabel")}</Label>
            <Input id={`replace-final-${meter.id}`} name="finalValue" inputMode="decimal" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`replace-label-${meter.id}`}>{t("newLabelLabel")}</Label>
            <Input id={`replace-label-${meter.id}`} name="newLabel" defaultValue={meter.label} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`replace-base-${meter.id}`}>{t("newBaseValueLabel")}</Label>
            <Input id={`replace-base-${meter.id}`} name="newBaseValue" inputMode="decimal" />
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
