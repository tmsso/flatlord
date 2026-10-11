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
import { MessageSquare } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RequestItemOption } from "@/lib/requests/get-request-item-options";

// Shared between tenant (no tenancyOptions — server resolves their own
// active tenancy) and admin (tenancyOptions required — logging a request
// on a tenant's behalf, e.g. a phone-in repair call).
// `trigger="cta"`: the tenant home's full-width secondary action (design/02).
// `itemOptions` (B-36): active inventory items + facilities per tenancy;
// the "affected item" picker appears for repair requests when the chosen
// tenancy's unit has any.
export function NewRequestDialog({
  tenancyOptions,
  itemOptions = [],
  trigger = "compact",
}: {
  tenancyOptions?: { id: string; label: string }[];
  itemOptions?: RequestItemOption[];
  trigger?: "compact" | "cta";
}) {
  const t = useTranslations("requests");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = !!tenancyOptions;
  const [category, setCategory] = useState<RequestCategory>("other");
  const [tenancyId, setTenancyId] = useState<string | undefined>(tenancyOptions?.[0]?.id);
  // A tenant has one active tenancy, so their options need no filter.
  const unitItems = isAdmin ? itemOptions.filter((o) => o.tenancyId === tenancyId) : itemOptions;
  const facilities = unitItems.filter((o) => o.kind === "facility");
  const movables = unitItems.filter((o) => o.kind !== "facility");
  const showItemPicker = category === "repair" && unitItems.length > 0;

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
            tenancyId: isAdmin ? (tenancyId ?? null) : null,
            category,
            title,
            description: (String(data.get("description") ?? "").trim() || null) as string | null,
            externalCaseRef: (String(data.get("externalCaseRef") ?? "").trim() || null) as string | null,
            appointmentDate: (String(data.get("appointmentDate") ?? "").trim() || null) as string | null,
            inventoryItemId: showItemPicker ? String(data.get("inventoryItemId") ?? "none").replace(/^none$/, "") || null : null,
          },
          file,
        );
        toast.success(tc("save"));
        setOpen(false);
        setCategory("other");
        (e.target as HTMLFormElement).reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === "cta" ? (
        <DialogTrigger render={<Button type="button" variant="outline" className="h-12 w-full gap-2 text-[15px]" />}>
          <MessageSquare className="size-4" aria-hidden="true" />
          {t("newRequestCta")}
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("newRequest")}</DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("newRequest")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requestTenancyId">{t("tenancyLabel")}</Label>
              <Select
                name="tenancyId"
                value={tenancyId}
                onValueChange={(v) => v && setTenancyId(v)}
                items={tenancyOptions?.map((opt) => ({ value: opt.id, label: opt.label }))}
              >
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
            <Select
              name="category"
              value={category}
              onValueChange={(v) => v && setCategory(v as RequestCategory)}
              items={REQUEST_CATEGORIES.map((c) => ({ value: c, label: t(`category_${c}`) }))}
            >
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
          {showItemPicker && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="requestInventoryItem">{t("affectedItemLabel")}</Label>
              <Select
                name="inventoryItemId"
                defaultValue="none"
                items={[{ value: "none", label: t("affectedItemNone") }, ...unitItems.map((o) => ({ value: o.id, label: o.title }))]}
              >
                <SelectTrigger id="requestInventoryItem">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("affectedItemNone")}</SelectItem>
                  {facilities.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t("affectedItemFacilities")}</SelectLabel>
                      {facilities.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {movables.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t("affectedItemItems")}</SelectLabel>
                      {movables.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
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
