"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { updateProperty } from "@/server/properties/update-property";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AddPropertyOwner } from "@/components/add-property-owner";

export interface PropertyDetailProps {
  property: {
    id: string;
    type: "house" | "flat" | "room";
    name: string;
    addressLine: string | null;
    hrsz: string | null;
    paymentInstructions: string | null;
    lettingMode: "whole" | "by_room" | null;
    active: boolean;
    isRoot: boolean;
  };
  childProperties: { id: string; name: string; type: string; hrsz: string | null; active: boolean }[];
  owners: { id: string; personName: string; percentage: number }[];
  inhabitants: { personId: string; name: string; registrationType: string | null; relationship: string }[];
  tenancyId: string | null;
  persons: { id: string; name: string }[];
}

const schema = z.object({
  name: z.string().min(1, "nameRequired"),
  addressLine: z.string().optional(),
  hrsz: z.string().optional(),
  paymentInstructions: z.string().optional(),
  lettingMode: z.enum(["whole", "by_room"]),
  active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

const registrationGroups = ["main_address", "temporary", "casual", "owner_agent"] as const;

export function PropertyDetail({ property, childProperties, owners, inhabitants, tenancyId, persons }: PropertyDetailProps) {
  const t = useTranslations("properties");
  const tc = useTranslations("common");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: property.name,
      addressLine: property.addressLine ?? "",
      hrsz: property.hrsz ?? "",
      paymentInstructions: property.paymentInstructions ?? "",
      lettingMode: property.lettingMode ?? "whole",
      active: property.active,
    },
  });

  function onSubmit(values: FormValues) {
    startTransition(async () => {
      try {
        await updateProperty({
          id: property.id,
          name: values.name,
          addressLine: property.type === "room" ? null : values.addressLine || null,
          hrsz: property.type === "room" ? null : values.hrsz || null,
          paymentInstructions: property.type === "room" ? null : values.paymentInstructions || null,
          lettingMode: property.type === "flat" ? values.lettingMode : null,
          active: values.active,
        });
        toast.success(tc("save"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  const groupedInhabitants = registrationGroups.map((g) => ({
    key: g,
    items: inhabitants.filter((i) => i.registrationType === g),
  }));
  const ungrouped = inhabitants.filter((i) => !i.registrationType);

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{property.name}</h2>
            <Badge variant="outline">{t(`type${property.type.charAt(0).toUpperCase()}${property.type.slice(1)}`)}</Badge>
          </div>
          <Controller
            control={control}
            name="active"
            render={({ field }) => (
              <div className="flex items-center gap-2">
                <Label className="text-sm">{tc("active")}</Label>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </div>
            )}
          />
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">{t("nameLabel")}</Label>
            <Input id="name" {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{t(errors.name.message ?? "nameRequired")}</p>}
          </div>

          {property.type !== "room" && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="addressLine">{t("addressLabel")}</Label>
                <Input id="addressLine" {...register("addressLine")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="hrsz">{t("hrszLabel")}</Label>
                <Input id="hrsz" {...register("hrsz")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="paymentInstructions">{t("paymentInstructionsLabel")}</Label>
                <Textarea id="paymentInstructions" {...register("paymentInstructions")} placeholder={t("paymentInstructionsPlaceholder")} />
                <p className="text-xs text-muted-foreground">{t("paymentInstructionsHint")}</p>
              </div>
            </>
          )}

          {property.type === "flat" && (
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

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {tc("save")}
            </Button>
          </div>
        </form>
      </Card>

      {property.isRoot && (
        <Card className="p-4">
          <CardHeader className="px-0 pt-0">
            <CardTitle>{t("ownershipTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="flex flex-wrap gap-2">
              {owners.map((o) => (
                <Badge key={o.id} variant="secondary">
                  {o.personName} {o.percentage}%
                </Badge>
              ))}
              <AddPropertyOwner propertyId={property.id} persons={persons} />
            </div>
          </CardContent>
        </Card>
      )}

      {childProperties.length > 0 && (
        <Card className="p-4">
          <CardHeader className="px-0 pt-0">
            <CardTitle>{t("childrenTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 px-0 pb-0">
            {childProperties.map((c) => (
              <Link key={c.id} href={`/properties/${c.id}`} className="flex items-center justify-between rounded-md border border-border p-2 text-sm hover:bg-muted">
                <span>{c.name}</span>
                <Badge variant={c.active ? "outline" : "secondary"}>{c.active ? tc("active") : tc("inactive")}</Badge>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle>{t("inhabitantsTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {groupedInhabitants
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.key} className="rounded-md border border-border p-3">
                  <p className="mb-2 text-xs font-semibold">{t(`registrationType_${g.key}`)}</p>
                  <div className="flex flex-col gap-1">
                    {g.items.map((i) => (
                      <Link key={i.personId} href={`/persons/${i.personId}`} className="text-sm text-primary hover:underline">
                        {i.name}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            {ungrouped.length > 0 && (
              <div className="rounded-md border border-border p-3">
                <p className="mb-2 text-xs font-semibold">{t("registrationType_none")}</p>
                <div className="flex flex-col gap-1">
                  {ungrouped.map((i) => (
                    <Link key={i.personId} href={`/persons/${i.personId}`} className="text-sm text-primary hover:underline">
                      {i.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {inhabitants.length === 0 && <p className="text-sm text-muted-foreground">{t("noInhabitants")}</p>}
          </div>
          {tenancyId && (
            <Link href={`/tenancies/${tenancyId}`} className="mt-3 inline-block text-sm text-primary hover:underline">
              {t("manageInhabitantsLink")}
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
