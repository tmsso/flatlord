"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { createInventoryItem } from "@/server/inventory/create-inventory-item";
import { updateInventoryItem } from "@/server/inventory/update-inventory-item";
import { launchReconfirmation } from "@/server/inventory/launch-reconfirmation";
import { reviewReconfirmationItem } from "@/server/inventory/review-reconfirmation-item";
import { AttachmentsSection, type AttachmentRow } from "@/components/attachments-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface InventoryItemRow {
  id: string;
  title: string;
  description: string | null;
  ownedBy: "owner" | "renter" | "conditional";
  condition: string | null;
  notes: string | null;
  actionByDate: string | null;
  actionByReason: string | null;
  status: "active" | "removed" | "transferred";
  attachments: AttachmentRow[];
}

export interface ReconfirmationCampaignRow {
  id: string;
  scope: "full" | "subset";
  status: "open" | "completed";
  initiatedAt: string;
  dueDate: string | null;
  note: string | null;
  items: { id: string; itemTitle: string; status: "pending" | "confirmed" | "discrepancy"; tenantNote: string | null }[];
}

const OWNED_BY_VARIANT: Record<string, "secondary" | "outline"> = { owner: "secondary", renter: "outline", conditional: "outline" };

function ItemFormDialog({
  unitId,
  item,
  onSaved,
}: {
  unitId: string;
  item?: InventoryItemRow;
  onSaved: () => void;
}) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    const payload = {
      title,
      description: (String(data.get("description") ?? "").trim() || null) as string | null,
      ownedBy: String(data.get("ownedBy") ?? "owner") as "owner" | "renter" | "conditional",
      condition: (String(data.get("condition") ?? "").trim() || null) as string | null,
      notes: (String(data.get("notes") ?? "").trim() || null) as string | null,
      actionByDate: (String(data.get("actionByDate") ?? "").trim() || null) as string | null,
      actionByReason: (String(data.get("actionByReason") ?? "").trim() || null) as string | null,
    };
    setError(null);
    startTransition(async () => {
      try {
        if (item) {
          await updateInventoryItem({ id: item.id, ...payload, status: item.status });
        } else {
          await createInventoryItem({ unitId, ...payload });
        }
        toast.success(tc("save"));
        setOpen(false);
        onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant={item ? "ghost" : "outline"} size="sm" />}>
        {item ? t("edit") : t("addItem")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? t("edit") : t("addItem")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemTitle">{t("titleLabel")}</Label>
            <Input id="itemTitle" name="title" defaultValue={item?.title} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemDescription">{t("descriptionLabel")}</Label>
            <Textarea id="itemDescription" name="description" defaultValue={item?.description ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemOwnedBy">{t("ownedByLabel")}</Label>
            <Select name="ownedBy" defaultValue={item?.ownedBy ?? "owner"}>
              <SelectTrigger id="itemOwnedBy">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owner">{t("ownedByOwner")}</SelectItem>
                <SelectItem value="renter">{t("ownedByRenter")}</SelectItem>
                <SelectItem value="conditional">{t("ownedByConditional")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemCondition">{t("conditionLabel")}</Label>
            <Input id="itemCondition" name="condition" defaultValue={item?.condition ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemNotes">{t("notesLabel")}</Label>
            <Textarea id="itemNotes" name="notes" defaultValue={item?.notes ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemActionByDate">{t("actionByDateLabel")}</Label>
            <Input id="itemActionByDate" name="actionByDate" type="date" defaultValue={item?.actionByDate ?? ""} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="itemActionByReason">{t("actionByReasonLabel")}</Label>
            <Input id="itemActionByReason" name="actionByReason" defaultValue={item?.actionByReason ?? ""} />
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

function StatusButton({ item, onChanged }: { item: InventoryItemRow; onChanged: () => void }) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  function setStatus(status: "active" | "removed" | "transferred") {
    startTransition(async () => {
      try {
        await updateInventoryItem({
          id: item.id,
          title: item.title,
          description: item.description,
          ownedBy: item.ownedBy,
          condition: item.condition,
          notes: item.notes,
          actionByDate: item.actionByDate,
          actionByReason: item.actionByReason,
          status,
        });
        toast.success(tc("save"));
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  if (item.status !== "active") {
    return (
      <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setStatus("active")}>
        {t("reactivate")}
      </Button>
    );
  }
  return (
    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setStatus("removed")}>
      {t("remove")}
    </Button>
  );
}

function LaunchReconfirmationDialog({ tenancyId, items, onLaunched }: { tenancyId: string; items: InventoryItemRow[]; onLaunched: () => void }) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"full" | "subset">("full");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const activeItems = items.filter((i) => i.status === "active");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await launchReconfirmation({
          tenancyId,
          scope,
          itemIds: scope === "subset" ? Array.from(selected) : undefined,
          dueDate: (String(data.get("dueDate") ?? "").trim() || null) as string | null,
          note: (String(data.get("note") ?? "").trim() || null) as string | null,
        });
        toast.success(tc("save"));
        setOpen(false);
        setSelected(new Set());
        onLaunched();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  if (activeItems.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("launchReconfirmation")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("launchReconfirmation")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reconfirmationScope">{t("scopeLabel")}</Label>
            <Select value={scope} onValueChange={(v) => v && setScope(v as "full" | "subset")}>
              <SelectTrigger id="reconfirmationScope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">{t("scopeFull")}</SelectItem>
                <SelectItem value="subset">{t("scopeSubset")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === "subset" && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-2">
              {activeItems.map((i) => (
                <label key={i.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selected.has(i.id)}
                    onCheckedChange={(checked) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) next.add(i.id);
                        else next.delete(i.id);
                        return next;
                      });
                    }}
                  />
                  {i.title}
                </label>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reconfirmationDueDate">{t("dueDateLabel")}</Label>
            <Input id="reconfirmationDueDate" name="dueDate" type="date" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reconfirmationNote">{t("campaignNoteLabel")}</Label>
            <Input id="reconfirmationNote" name="note" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isPending || (scope === "subset" && selected.size === 0)}>
              {tc("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReconfirmationCampaignCard({ campaign, onChanged }: { campaign: ReconfirmationCampaignRow; onChanged: () => void }) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const format = useFormatter();
  const [isPending, startTransition] = useTransition();
  const discrepancies = campaign.items.filter((i) => i.status === "discrepancy");

  function handleReview(id: string) {
    startTransition(async () => {
      try {
        await reviewReconfirmationItem({ id });
        toast.success(tc("save"));
        onChanged();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  const confirmedCount = campaign.items.filter((i) => i.status !== "pending").length;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {format.dateTime(new Date(campaign.initiatedAt))} · {t(`scope${campaign.scope === "full" ? "Full" : "Subset"}`)}
        </span>
        <Badge variant={campaign.status === "open" ? "outline" : "secondary"}>{t(`campaignStatus_${campaign.status}`)}</Badge>
      </div>
      <span className="text-xs text-muted-foreground">
        {t("progress", { done: confirmedCount, total: campaign.items.length })}
      </span>
      {discrepancies.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-destructive">{t("needsReview")}</span>
          {discrepancies.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {i.itemTitle}
                {i.tenantNote && <span className="text-muted-foreground"> — {i.tenantNote}</span>}
              </span>
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleReview(i.id)}>
                {t("markReviewed")}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function InventorySection({
  unitId,
  tenancyId,
  items,
  campaigns,
}: {
  unitId: string;
  tenancyId: string | null;
  items: InventoryItemRow[];
  campaigns: ReconfirmationCampaignRow[];
}) {
  const t = useTranslations("inventory");
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <div className="flex items-center gap-2">
          {tenancyId && <LaunchReconfirmationDialog tenancyId={tenancyId} items={items} onLaunched={refresh} />}
          <ItemFormDialog unitId={unitId} onSaved={refresh} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {items.map((item) => (
          <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-sm font-medium">{item.title}</span>
                {item.description && <span className="text-xs text-muted-foreground">{item.description}</span>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={OWNED_BY_VARIANT[item.ownedBy]}>{t(`ownedBy${item.ownedBy === "owner" ? "Owner" : item.ownedBy === "renter" ? "Renter" : "Conditional"}`)}</Badge>
                {item.status !== "active" && <Badge variant="secondary">{t(`itemStatus_${item.status}`)}</Badge>}
              </div>
            </div>
            {item.condition && <span className="text-xs text-muted-foreground">{t("conditionLabel")}: {item.condition}</span>}
            {item.actionByDate && (
              <span className="text-xs text-muted-foreground">
                {t("actionByDateLabel")}: {item.actionByDate}
                {item.actionByReason && ` — ${item.actionByReason}`}
              </span>
            )}
            <AttachmentsSection entityType="inventory_item" entityId={item.id} attachments={item.attachments} />
            <div className="flex items-center gap-2 self-end">
              <ItemFormDialog unitId={unitId} item={item} onSaved={refresh} />
              <StatusButton item={item} onChanged={refresh} />
            </div>
          </div>
        ))}
        {campaigns.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("campaignsTitle")}</span>
            {campaigns.map((c) => (
              <ReconfirmationCampaignCard key={c.id} campaign={c} onChanged={refresh} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
