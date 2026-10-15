"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { createTenancy } from "@/server/tenancies/create-tenancy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const registrationTypes = ["main_address", "temporary", "casual", "owner_agent"] as const;
const statuses = ["draft", "active", "ended", "terminated"] as const;

const schema = z.object({
  unitId: z.string().min(1, "unitRequired"),
  primaryTenantId: z.string().min(1, "tenantRequired"),
  primaryTenantRegistrationType: z.enum(registrationTypes).nullable(),
  termStart: z.string().min(1, "termStartRequired"),
  termEnd: z.string().optional(),
  // Kept as validated strings, not z.coerce.number() — avoids a zod-v4/
  // react-hook-form generic mismatch (same fix as recordPaymentSchema in
  // statement-detail.tsx); converted to numbers explicitly in onSubmit.
  noticeDays: z.string().regex(/^\d+$/, "noticeDaysInvalid"),
  dueDay: z.string().regex(/^\d+$/, "dueDayInvalid"),
  status: z.enum(statuses),
});
type FormValues = z.infer<typeof schema>;

export function TenancyCreateForm({
  units,
  persons,
  defaultUnitId,
  defaultPersonId,
  defaultStatus = "draft",
  onCreated,
}: {
  units: { id: string; name: string; type: string }[];
  persons: { id: string; name: string }[];
  defaultUnitId?: string;
  defaultPersonId?: string;
  /** The wizard (B-42) creates an active tenancy — a draft one isn't visible to the tenant. */
  defaultStatus?: FormValues["status"];
  /** Wizard use: called instead of navigating after create; also hides Cancel. */
  onCreated?: (id: string) => void;
}) {
  const t = useTranslations("tenancies");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      unitId: defaultUnitId,
      primaryTenantId: defaultPersonId,
      primaryTenantRegistrationType: null,
      noticeDays: "30",
      dueDay: "5",
      status: defaultStatus,
    },
  });

  function onSubmit(values: FormValues) {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createTenancy({
          unitId: values.unitId,
          primaryTenantId: values.primaryTenantId,
          primaryTenantRegistrationType: values.primaryTenantRegistrationType,
          termStart: values.termStart,
          termEnd: values.termEnd || null,
          noticeDays: Number(values.noticeDays),
          dueDay: Number(values.dueDay),
          status: values.status,
        });
        if (onCreated) onCreated(id);
        else router.push(`/tenancies/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Card className="max-w-2xl p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="unitId">{t("unitLabel")}</Label>
          <Controller
            control={control}
            name="unitId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                items={units.map((u) => ({ value: u.id, label: u.name }))}
              >
                <SelectTrigger id="unitId" className="w-full">
                  <SelectValue placeholder={t("unitPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.unitId && <p className="text-sm text-destructive">{t("unitRequired")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primaryTenantId">{t("primaryTenantLabel")}</Label>
          <Controller
            control={control}
            name="primaryTenantId"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={field.onChange}
                items={persons.map((p) => ({ value: p.id, label: p.name }))}
              >
                <SelectTrigger id="primaryTenantId" className="w-full">
                  <SelectValue placeholder={t("tenantPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {persons.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {errors.primaryTenantId && <p className="text-sm text-destructive">{t("tenantRequired")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="registrationType">{t("registrationTypeLabel")}</Label>
          <Controller
            control={control}
            name="primaryTenantRegistrationType"
            render={({ field }) => (
              <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                <SelectTrigger id="registrationType" className="w-full">
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

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          {!onCreated && (
            <Button type="button" variant="outline" onClick={() => router.push("/tenancies")}>
            {tc("cancel")}
          </Button>
          )}
          <Button type="submit" disabled={isPending}>
            {tc("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
