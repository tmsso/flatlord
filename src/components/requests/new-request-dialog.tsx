"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { createRequest } from "@/server/requests/create-request";
import { REQUEST_CATEGORIES, type RequestCategory } from "@/db/schema/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Shared between tenant (no tenancyOptions — server resolves their own
// active tenancy) and admin (tenancyOptions required — logging a request
// on a tenant's behalf, e.g. a phone-in repair call).
export function NewRequestDialog({ tenancyOptions }: { tenancyOptions?: { id: string; label: string }[] }) {
  const t = useTranslations("requests");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = !!tenancyOptions;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    const file = fileRef.current?.files?.[0];
    setError(null);
    startTransition(async () => {
      try {
        await createRequest(
          {
            tenancyId: isAdmin ? String(data.get("tenancyId") ?? "") || null : null,
            category: String(data.get("category") ?? "other") as RequestCategory,
            title,
            description: (String(data.get("description") ?? "").trim() || null) as string | null,
            externalCaseRef: (String(data.get("externalCaseRef") ?? "").trim() || null) as string | null,
            appointmentDate: (String(data.get("appointmentDate") ?? "").trim() || null) as string | null,
          },
          file,
        );
        toast.success(tc("save"));
        setOpen(false);
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("newRequest")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newRequest")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requestTenancyId">{t("tenancyLabel")}</Label>
              <Select name="tenancyId" defaultValue={tenancyOptions?.[0]?.id}>
                <SelectTrigger id="requestTenancyId">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tenancyOptions?.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requestCategory">{t("categoryLabel")}</Label>
            <Select name="category" defaultValue="other">
              <SelectTrigger id="requestCategory">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REQUEST_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`category_${c}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requestTitle">{t("titleLabel")}</Label>
            <Input id="requestTitle" name="title" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requestDescription">{t("descriptionLabel")}</Label>
            <Textarea id="requestDescription" name="description" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requestAppointmentDate">{t("appointmentDateLabel")}</Label>
            <Input id="requestAppointmentDate" name="appointmentDate" type="date" />
          </div>
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requestExternalCaseRef">{t("externalCaseRefLabel")}</Label>
              <Input id="requestExternalCaseRef" name="externalCaseRef" />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requestFile">{t("attachmentLabel")}</Label>
            <Input id="requestFile" ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/webp" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending}>
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
