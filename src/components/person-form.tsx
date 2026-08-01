"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createPerson } from "@/server/persons/create-person";
import { updatePerson } from "@/server/persons/update-person";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const documentTypes = ["id_card", "passport", "residence_permit"] as const;

const schema = z.object({
  givenName: z.string().min(1, "givenNameRequired"),
  familyName: z.string().min(1, "familyNameRequired"),
  documentType: z.enum(documentTypes).nullable(),
  documentNumber: z.string().optional(),
  dob: z.string().optional(),
  birthName: z.string().optional(),
  birthPlace: z.string().optional(),
  mothersName: z.string().optional(),
  citizenship: z.string().optional(),
  addressCardNumber: z.string().optional(),
  taxId: z.string().optional(),
  phone: z.string().optional(),
  contactEmail: z.string().email("contactEmailInvalid").optional().or(z.literal("")),
  registeredAddress: z.string().optional(),
  temporaryAddress: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export interface PersonFormRequirement {
  fieldName: string; // snake_case, matches field_requirements.field_name
  required: boolean;
  note: string | null;
}

export interface PersonFormProps {
  mode: "create" | "edit";
  personId?: string;
  initialValues?: Partial<FormValues>;
  requirements: PersonFormRequirement[];
  requirementLabel?: string; // e.g. "registered inhabitant — main address at Kertész utca 12"
}

// snake_case field_requirements.field_name -> the form field it maps to.
const FIELD_NAME_MAP: Record<string, keyof FormValues> = {
  document_type: "documentType",
  document_number: "documentNumber",
  dob: "dob",
  address_card_number: "addressCardNumber",
};

export function PersonForm({ mode, personId, initialValues, requirements, requirementLabel }: PersonFormProps) {
  const t = useTranslations("persons");
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
      givenName: "",
      familyName: "",
      documentType: null,
      ...initialValues,
    },
  });

  const requiredFieldKeys = new Set(
    requirements.filter((r) => r.required).map((r) => FIELD_NAME_MAP[r.fieldName]).filter(Boolean),
  );

  function isRequired(field: keyof FormValues) {
    return requiredFieldKeys.has(field);
  }

  function onSubmit(values: FormValues) {
    setError(null);
    const payload = {
      givenName: values.givenName,
      familyName: values.familyName,
      documentType: values.documentType,
      documentNumber: values.documentNumber || null,
      dob: values.dob || null,
      birthName: values.birthName || null,
      birthPlace: values.birthPlace || null,
      mothersName: values.mothersName || null,
      citizenship: values.citizenship || null,
      addressCardNumber: values.addressCardNumber || null,
      taxId: values.taxId || null,
      phone: values.phone || null,
      contactEmail: values.contactEmail || null,
      registeredAddress: values.registeredAddress || null,
      temporaryAddress: values.temporaryAddress || null,
    };
    startTransition(async () => {
      try {
        if (mode === "create") {
          const { id } = await createPerson(payload);
          router.push(`/persons/${id}`);
        } else if (personId) {
          await updatePerson({ id: personId, ...payload });
          toast.success(tc("save"));
          router.refresh();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Card className="max-w-3xl p-4">
      {requirementLabel && (
        <div className="mb-4 rounded-md border border-info-border bg-info-bg p-3 text-sm text-info">
          {t("requirementBannerPrefix")} <strong>{requirementLabel}</strong>. {t("requirementBannerSuffix")}
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="givenName">{t("givenNameLabel")}</Label>
          <Input id="givenName" {...register("givenName")} />
          {errors.givenName && <p className="text-sm text-destructive">{t(errors.givenName.message ?? "givenNameRequired")}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="familyName">{t("familyNameLabel")}</Label>
          <Input id="familyName" {...register("familyName")} />
          {errors.familyName && <p className="text-sm text-destructive">{t(errors.familyName.message ?? "familyNameRequired")}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="birthName">{t("birthNameLabel")}</Label>
          <Input id="birthName" {...register("birthName")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mothersName">{t("mothersNameLabel")}</Label>
          <Input id="mothersName" {...register("mothersName")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="birthPlace">{t("birthPlaceLabel")}</Label>
          <Input id="birthPlace" {...register("birthPlace")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="dob">
            {t("dobLabel")} {isRequired("dob") && "*"}
          </Label>
          <Input id="dob" type="date" {...register("dob")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="citizenship">{t("citizenshipLabel")}</Label>
          <Input id="citizenship" {...register("citizenship")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentType">
            {t("documentTypeLabel")} {isRequired("documentType") && "*"}
          </Label>
          <Controller
            control={control}
            name="documentType"
            render={({ field }) => (
              <Select value={field.value ?? "none"} onValueChange={(v) => field.onChange(v === "none" ? null : v)}>
                <SelectTrigger id="documentType" className="w-full">
                  <SelectValue>{(v: string) => (v === "none" ? "—" : t(`documentType_${v}`))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {documentTypes.map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      {t(`documentType_${dt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="documentNumber">
            {t("documentNumberLabel")} {isRequired("documentNumber") && "*"}
          </Label>
          <Input id="documentNumber" {...register("documentNumber")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="addressCardNumber">
            {t("addressCardNumberLabel")} {isRequired("addressCardNumber") && "*"}
          </Label>
          <Input id="addressCardNumber" {...register("addressCardNumber")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="taxId">{t("taxIdLabel")}</Label>
          <Input id="taxId" {...register("taxId")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="phone">{t("phoneLabel")}</Label>
          <Input id="phone" {...register("phone")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="contactEmail">{t("contactEmailLabel")}</Label>
          <Input id="contactEmail" type="email" {...register("contactEmail")} />
          {errors.contactEmail && <p className="text-sm text-destructive">{t(errors.contactEmail.message ?? "contactEmailInvalid")}</p>}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="registeredAddress">{t("registeredAddressLabel")}</Label>
          <Input id="registeredAddress" {...register("registeredAddress")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="temporaryAddress">{t("temporaryAddressLabel")}</Label>
          <Input id="temporaryAddress" {...register("temporaryAddress")} />
        </div>

        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}

        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button type="button" variant="outline" onClick={() => router.push("/persons")}>
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
