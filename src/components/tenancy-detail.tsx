"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateTenancy } from "@/server/tenancies/update-tenancy";
import { endTenancyOccupancy } from "@/server/tenancies/end-tenancy-occupancy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddTenancyOccupant } from "@/components/add-tenancy-occupant";

const registrationTypes = ["main_address", "temporary", "casual", "owner_agent"] as const;
const statuses = ["draft", "active", "ended", "terminated"] as const;

const schema = z.object({
  primaryTenantRegistrationType: z.enum(registrationTypes).nullable(),
  termStart: z.string().min(1, "termStartRequired"),
  termEnd: z.string().optional(),
  noticeDays: z.string().regex(/^\d+$/, "noticeDaysInvalid"),
  dueDay: z.string().regex(/^\d+$/, "dueDayInvalid"),
  status: z.enum(statuses),
});
type FormValues = z.infer<typeof schema>;

export interface TenancyDetailProps {
  tenancy: {
    id: string;
    propertyName: string;
    primaryTenantName: string;
    primaryTenantRegistrationType: string | null;
    termStart: string;
    termEnd: string | null;
    noticeDays: number;
    dueDay: number;
    status: string;
  };
  occupants: {
    id: string;
    personId: string;
    personName: string;
    relationship: string;
    registrationType: string | null;
    moveIn: string | null;
    moveOut: string | null;
  }[];
  persons: { id: string; name: string }[];
}

export function TenancyDetail({ tenancy, occupants, persons }: TenancyDetailProps) {
  const t = useTranslations("tenancies");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [endingId, setEndingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      primaryTenantRegistrationType: tenancy.primaryTenantRegistrationType as FormValues["primaryTenantRegistrationType"],
      termStart: tenancy.termStart,
      termEnd: tenancy.termEnd ?? "",
      noticeDays: String(tenancy.noticeDays),
      dueDay: String(tenancy.dueDay),
      status: tenancy.status as FormValues["status"],
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        await updateTenancy({
          id: tenancy.id,
          primaryTenantRegistrationType: values.primaryTenantRegistrationType,
          termStart: values.termStart,
          termEnd: values.termEnd || null,
          noticeDays: Number(values.noticeDays),
          dueDay: Number(values.dueDay),
          status: values.status,
        });
        toast.success(tc("save"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleEndOccupancy(occupantId: string) {
    setEndingId(occupantId);
    startTransition(async () => {
      try {
        await endTenancyOccupancy({ id: occupantId, moveOut: new Date().toISOString().slice(0, 10) });
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      } finally {
        setEndingId(null);
      }
    });
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">{tenancy.propertyName}</h2>
            <p className="text-sm text-muted-foreground">{t("primaryTenantLabel")}: {tenancy.primaryTenantName}</p>
          </div>
          <Badge variant="outline">{t(`status_${tenancy.status}`)}</Badge>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="registrationType">{t("registrationTypeLabel")}</Label>
            <Controller
              control={control}
              name="primaryTenantRegistrationType"
              render={({ field }) => (
                <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                  <SelectTrigger id="registrationType" className="w-full">
                    {/* Explicit render function, not the bare auto-lookup —
                    Base UI's Select.Value can only resolve an item's label
                    from its registered SelectItems, which only mount once
                    the popup itself has opened at least once; on first
                    paint with a pre-set value (edit mode) it would
                    otherwise show the raw enum string. */}
                    <SelectValue>{(v: string) => (v === "none" ? t("registrationTypeNone") : t(`registrationType_${v}`))}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("registrationTypeNone")}</SelectItem>
                    {registrationTypes.map((rt) => (
                      <SelectItem key={rt} value={rt}>
                        {t(`registrationType_${rt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="termStart">{t("termStartLabel")}</Label>
              <Input id="termStart" type="date" {...register("termStart")} />
              {errors.termStart && <p className="text-sm text-destructive">{t("termStartRequired")}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="termEnd">{t("termEndLabel")}</Label>
              <Input id="termEnd" type="date" {...register("termEnd")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="noticeDays">{t("noticeDaysLabel")}</Label>
              <Input id="noticeDays" type="number" {...register("noticeDays")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dueDay">{t("dueDayLabel")}</Label>
              <Input id="dueDay" type="number" {...register("dueDay")} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="status">{t("statusLabel")}</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="status" className="w-40">
                    <SelectValue>{(v: string) => t(`status_${v}`)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`status_${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle>{t("occupantsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 px-0 pb-0">
          {occupants.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noOccupants")}</p>
          ) : (
            occupants.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-md border border-border p-2.5 text-sm">
                <div className="flex flex-col">
                  <Link href={`/persons/${o.personId}`} className="font-medium">
                    {o.personName}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {o.relationship}
                    {o.registrationType ? ` · ${t(`registrationType_${o.registrationType}`)}` : ""}
                    {o.moveOut ? ` · ${t("endedOn", { date: o.moveOut })}` : ""}
                  </span>
                </div>
                {!o.moveOut && (
                  <Button variant="destructive" size="sm" disabled={isPending && endingId === o.id} onClick={() => handleEndOccupancy(o.id)}>
                    {t("endOccupancy")}
                  </Button>
                )}
              </div>
            ))
          )}
          <div className="mt-2">
            <AddTenancyOccupant tenancyId={tenancy.id} persons={persons} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
