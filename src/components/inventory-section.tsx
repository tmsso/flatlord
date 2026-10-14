"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { createInventoryItem } from "@/server/inventory/create-inventory-item";
import { updateInventoryItem } from "@/server/inventory/update-inventory-item";
import { FACILITY_NEEDS_OWNER } from "@/lib/inventory/errors";
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
import { cn } from "@/lib/utils";

export interface InventoryItemRow {
  id: string;
  kind: "item" | "facility";
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


function ItemFormDialog({
  unitId,
  item,
  kind: newKind = "item",
  onSaved,
}: {
  unitId: string;
  item?: InventoryItemRow;
  /** For a new row; an existing row keeps its own kind. */
  kind?: "item" | "facility";
  onSaved: () => void;
}) {
  const t = useTranslations("inventory");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // An existing row can switch kind (B-38 / D-31); a new row's is fixed by
  // which "Add" button opened the dialog.
  const [kind, setKind] = useState<"item" | "facility">(item?.kind ?? newKind);
  const isFacility = kind === "facility";
  const conversionBlocked = !!item && item.kind !== "facility" && isFacility && item.ownedBy !== "owner";
  const addLabel = isFacility ? t("addFacility") : t("addItem");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    if (!title) return;
    if (conversionBlocked) {
      setError(t("facilityNeedsOwner"));
      return;
    }
    const payload = {
      title,
      description: (String(data.get("description") ?? "").trim() || null) as string | null,
      // Facilities are always owner-owned (DB CHECK); the field isn't shown.
      ownedBy: (isFacility ? "owner" : String(data.get("ownedBy") ?? "owner")) as "owner" | "renter" | "conditional",
      condition: (String(data.get("condition") ?? "").trim() || null) as string | null,
      notes: (String(data.get("notes") ?? "").trim() || null) as string | null,
      actionByDate: (String(data.get("actionByDate") ?? "").trim() || null) as string | null,
      actionByReason: (String(data.get("actionByReason") ?? "").trim() || null) as string | null,
    };
    setError(null);
    startTransition(async () => {
      try {
        if (item) {
          await updateInventoryItem({ id: item.id, ...payload, status: item.status, kind });
        } else {
          await createInventoryItem({ unitId, kind, ...payload });
        }
        toast.success(tc("save"));
        setOpen(false);
        onSaved();
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        setError(message === FACILITY_NEEDS_OWNER ? t("facilityNeedsOwner") : message || t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setKind(item?.kind ?? newKind);
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant={item ? "ghost" : isFacility ? "outline" : "default"} size="sm" />}>
        {item ? t("edit") : addLabel}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? t("edit") : addLabel}</DialogTitle>
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
          {item && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itemKind">{t("kindLabel")}</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as "item" | "facility");
                  setError(null);
                }}
                items={{ item: t("kindItem"), facility: t("kindFacility") }}
              >
                <SelectTrigger id="itemKind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="item">{t("kindItem")}</SelectItem>
                  <SelectItem value="facility">{t("kindFacility")}</SelectItem>
                </SelectContent>
              </Select>
              {conversionBlocked && <p className="text-xs text-destructive">{t("facilityNeedsOwner")}</p>}
            </div>
          )}
          {isFacility ? (
            <p className="text-xs text-muted-foreground">{t("facilityOwnerNote")}</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="itemOwnedBy">{t("ownedByLabel")}</Label>
              <Select
                name="ownedBy"
                defaultValue={item?.ownedBy ?? "owner"}
                items={{ owner: t("ownedByOwner"), renter: t("ownedByRenter"), conditional: t("ownedByConditional") }}
              >
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
          )}
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
            <Select
              value={scope}
              onValueChange={(v) => v && setScope(v as "full" | "subset")}
              items={{ full: t("scopeFull"), subset: t("scopeSubset") }}
            >
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

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|gif)$/i;

// design/09 10a: grid card (photo, title, ownership · condition chip);
// the card opens a detail dialog with the photo gallery / attachments,
// condition, action-by flag and the edit + status actions.
function ItemCard({ unitId, item, onChanged }: { unitId: string; item: InventoryItemRow; onChanged: () => void }) {
  const t = useTranslations("inventory");
  const format = useFormatter();
  const refresh = onChanged;
  const photo = item.attachments.find((a) => a.downloadUrl && IMAGE_EXT.test(a.fileName));
  const ownedLabel = t(`ownedBy${item.ownedBy === "owner" ? "Owner" : item.ownedBy === "renter" ? "Renter" : "Conditional"}`);
  const actionBy = item.actionByDate
    ? format.dateTime(new Date(`${item.actionByDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })
    : null;
  // Facilities are always owner-owned — the chip shows condition only.
  const chip = [item.kind === "facility" ? null : ownedLabel, item.condition].filter(Boolean).join(" · ");

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-shadow hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              item.status !== "active" && "opacity-60",
            )}
          />
        }
      >
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo.downloadUrl!} alt="" className="h-24 w-full border-b border-border object-cover" />
        ) : (
          <div
            className="h-24 w-full border-b border-border bg-[repeating-linear-gradient(135deg,var(--muted)_0_10px,transparent_10px_20px)]"
            aria-hidden="true"
          />
        )}
        <div className="flex flex-col gap-1 p-2.5">
          <span className="truncate text-sm font-medium">{item.title}</span>
          <div className="flex flex-wrap gap-1">
            {item.ownedBy === "conditional" || actionBy ? (
              <Badge variant="warning">{[ownedLabel, actionBy && t("byDate", { date: actionBy })].filter(Boolean).join(" · ")}</Badge>
            ) : (
              chip && <Badge variant="secondary">{chip}</Badge>
            )}
            {item.status !== "active" && <Badge variant="outline">{t(`itemStatus_${item.status}`)}</Badge>}
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("ownedByLabel")}</dt>
            <dd>{item.kind === "facility" ? t("facilityOwnerShort") : ownedLabel}</dd>
            {item.condition && (
              <>
                <dt className="text-muted-foreground">{t("conditionLabel")}</dt>
                <dd>{item.condition}</dd>
              </>
            )}
            {actionBy && (
              <>
                <dt className="text-muted-foreground">{t("actionByDateLabel")}</dt>
                <dd>
                  {actionBy}
                  {item.actionByReason && ` — ${item.actionByReason}`}
                </dd>
              </>
            )}
            {item.notes && (
              <>
                <dt className="text-muted-foreground">{t("notesLabel")}</dt>
                <dd className="whitespace-pre-wrap">{item.notes}</dd>
              </>
            )}
          </dl>
          <AttachmentsSection entityType="inventory_item" entityId={item.id} attachments={item.attachments} />
          <div className="flex items-center justify-end gap-2">
            <StatusButton item={item} onChanged={refresh} />
            <ItemFormDialog unitId={unitId} item={item} onSaved={refresh} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
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
  const facilities = items.filter((i) => i.kind === "facility");
  const movables = items.filter((i) => i.kind !== "facility");

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("titleWithCount", { count: items.length })}</CardTitle>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {tenancyId && <LaunchReconfirmationDialog tenancyId={tenancyId} items={items} onLaunched={refresh} />}
          <ItemFormDialog unitId={unitId} kind="facility" onSaved={refresh} />
          <ItemFormDialog unitId={unitId} onSaved={refresh} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {items.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {facilities.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t("facilitiesTitle")}</span>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {facilities.map((item) => (
                <ItemCard key={item.id} unitId={unitId} item={item} onChanged={refresh} />
              ))}
            </div>
          </div>
        )}
        {movables.length > 0 && (
          <div className="flex flex-col gap-2">
            {facilities.length > 0 && <span className="text-sm font-medium">{t("itemsTitle")}</span>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {movables.map((item) => (
                <ItemCard key={item.id} unitId={unitId} item={item} onChanged={refresh} />
              ))}
            </div>
          </div>
        )}
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
