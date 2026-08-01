"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { createProperty } from "@/server/properties/create-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const propertyTypes = ["house", "flat", "room"] as const;

const schema = z.object({
  type: z.enum(propertyTypes),
  name: z.string().min(1, "nameRequired"),
  parentId: z.string().nullable(),
  addressLine: z.string().optional(),
  hrsz: z.string().optional(),
  lettingMode: z.enum(["whole", "by_room"]),
});
type FormValues = z.infer<typeof schema>;

export function PropertyCreateForm({
  parentCandidates,
}: {
  parentCandidates: { id: string; name: string; type: string }[];
}) {
  const t = useTranslations("properties");
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
    defaultValues: { type: "flat", parentId: null, lettingMode: "whole" },
  });
  const type = useWatch({ control, name: "type" });

  function onSubmit(values: FormValues) {
    setError(null);
    startTransition(async () => {
      try {
        const { id } = await createProperty({
          type: values.type,
          name: values.name,
          parentId: values.parentId,
          addressLine: values.type === "room" ? null : (values.addressLine ?? null),
          hrsz: values.type === "room" ? null : (values.hrsz ?? null),
          lettingMode: values.type === "flat" ? values.lettingMode : null,
        });
        router.push(`/properties/${id}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Card className="max-w-2xl p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>{t("typeLabel")}</Label>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <div className="flex gap-1 rounded-lg border border-border p-1">
                {propertyTypes.map((pt) => (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => field.onChange(pt)}
                    className={`h-8 flex-1 rounded-md text-sm font-medium ${field.value === pt ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  >
                    {t(`type${pt.charAt(0).toUpperCase()}${pt.slice(1)}`)}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="name">{t("nameLabel")}</Label>
          <Input id="name" {...register("name")} />
          {errors.name && <p className="text-sm text-destructive">{t(errors.name.message ?? "nameRequired")}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="parentId">{t("parentLabel")}</Label>
          <Controller
            control={control}
            name="parentId"
            render={({ field }) => (
              <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                <SelectTrigger id="parentId" className="w-full">
                  <SelectValue>{(v: string) => (v === "none" ? t("parentNone") : (parentCandidates.find((p) => p.id === v)?.name ?? v))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("parentNone")}</SelectItem>
                  {parentCandidates.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {type === "room" && <p className="text-xs text-muted-foreground">{t("parentRequiredForRoom")}</p>}
        </div>

        {type !== "room" && (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="addressLine">{t("addressLabel")}</Label>
              <Input id="addressLine" {...register("addressLine")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hrsz">{t("hrszLabel")}</Label>
              <Input id="hrsz" {...register("hrsz")} />
            </div>
          </>
        )}

        {type === "flat" && (
          <div className="flex items-center gap-2">
            <Controller
              control={control}
              name="lettingMode"
              render={({ field }) => (
                <Switch checked={field.value === "whole"} onCheckedChange={(c) => field.onChange(c ? "whole" : "by_room")} />
              )}
            />
            <Label>{t("lettableWholeLabel")}</Label>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/properties")}>
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={isPending}>
            {tc("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
