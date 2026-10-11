"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { submitReconfirmationResponse } from "@/server/inventory/submit-reconfirmation-response";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface TenantInventoryItemRow {
  id: string;
  kind: "item" | "facility";
  title: string;
  ownedBy: "owner" | "renter" | "conditional";
  condition: string | null;
}

export interface TenantReconfirmationItemRow {
  id: string;
  inventoryItemId: string;
  itemTitle: string;
  status: "pending" | "confirmed" | "discrepancy";
}

// Item-by-item confirm/flag row (CLAUDE.md §3.9) with an optional note and
// photo — the one deliberate tenant-write exception to item 4's admin-only
// attachments precedent, see submit-reconfirmation-response.ts.
// design/09 10b: one pending item at a time — big "OK" / "Discrepancy…"
// buttons and a dashed optional-photo box. "Discrepancy…" first asks for
// a note (it auto-opens a request for the owner), then submits.
function ReconfirmationRow({ row, onResponded }: { row: TenantReconfirmationItemRow; onResponded: () => void }) {
  const t = useTranslations("inventory");
  const [note, setNote] = useState("");
  const [flagging, setFlagging] = useState(false);
  const [photoName, setPhotoName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  function respond(status: "confirmed" | "discrepancy") {
    startTransition(async () => {
      try {
        await submitReconfirmationResponse(
          { reconfirmationItemId: row.id, status, tenantNote: note.trim() || null },
          fileRef.current?.files?.[0],
        );
        toast.success(t("responseRecorded"));
        onResponded();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div
          className="size-14 shrink-0 rounded-md border border-border bg-[repeating-linear-gradient(135deg,var(--muted)_0_8px,transparent_8px_16px)]"
          aria-hidden="true"
        />
        <span className="text-sm font-medium">{row.itemTitle}</span>
      </div>
      {flagging ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`reconfirmNote-${row.id}`}>{t("discrepancyNoteLabel")}</Label>
          <Input
            id={`reconfirmNote-${row.id}`}
            type="text"
            placeholder={t("tenantNotePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            autoFocus
          />
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" className="h-11" disabled={isPending} onClick={() => setFlagging(false)}>
              {t("back")}
            </Button>
            <Button
              type="button"
              className="h-11 border-warning-border bg-warning-bg text-warning hover:brightness-95"
              disabled={isPending}
              onClick={() => respond("discrepancy")}
            >
              {t("flagDiscrepancy")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            className="h-12 border border-success-border bg-success-bg text-success hover:brightness-95"
            disabled={isPending}
            onClick={() => respond("confirmed")}
          >
            ✓ {t("okShort")}
          </Button>
          <Button
            type="button"
            className="h-12 border border-warning-border bg-warning-bg text-warning hover:brightness-95"
            disabled={isPending}
            onClick={() => setFlagging(true)}
          >
            {t("discrepancyEllipsis")}
          </Button>
        </div>
      )}
      <label
        htmlFor={`reconfirmPhoto-${row.id}`}
        className="flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-input px-3 text-center text-sm text-muted-foreground hover:bg-muted"
      >
        {photoName ?? t("photoOptionalHint")}
        <input
          id={`reconfirmPhoto-${row.id}`}
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,image/webp"
          className="sr-only"
          onChange={(e) => setPhotoName(e.target.files?.[0]?.name ?? null)}
        />
      </label>
      <p className="text-xs text-muted-foreground">{t("discrepancyOpensRequest")}</p>
    </div>
  );
}

export function TenantInventorySection({
  items,
  activeCampaign,
}: {
  items: TenantInventoryItemRow[];
  activeCampaign: { id: string; dueDate: string | null; items: TenantReconfirmationItemRow[] } | null;
}) {
  const t = useTranslations("inventory");
  const format = useFormatter();
  const router = useRouter();
  // Facilities (B-35) are built in and always owner-owned — no ownership
  // badge; listed first, like the admin view.
  const facilities = items.filter((i) => i.kind === "facility");
  const movables = items.filter((i) => i.kind !== "facility");
  const nextPending = activeCampaign?.items.find((r) => r.status === "pending") ?? null;
  const answered = activeCampaign?.items.filter((r) => r.status !== "pending") ?? [];

  return (
    <div className="flex flex-col gap-4">
      {activeCampaign && (
        <Card>
          <CardHeader className="flex flex-col gap-2">
            <CardTitle>
              {t("reconfirmationTitle")} · {answered.length} / {activeCampaign.items.length}
            </CardTitle>
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={activeCampaign.items.length}
              aria-valuenow={answered.length}
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${(answered.length / Math.max(1, activeCampaign.items.length)) * 100}%` }} />
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {activeCampaign.dueDate ? t("reconfirmationDueBy", { date: format.dateTime(new Date(`${activeCampaign.dueDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) }) : t("reconfirmationNoDueDate")}
            </p>
            {nextPending ? (
              <ReconfirmationRow key={nextPending.id} row={nextPending} onResponded={() => router.refresh()} />
            ) : (
              <p className="text-sm text-success">{t("reconfirmationAllDone")}</p>
            )}
            {answered.length > 0 && (
              <ul className="flex flex-col gap-1.5 border-t border-border pt-3">
                {answered.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{row.itemTitle}</span>
                    <Badge variant={row.status === "discrepancy" ? "warning" : "secondary"}>{t(`reconfirmationStatus_${row.status}`)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
          {facilities.length > 0 && <span className="text-sm font-medium">{t("facilitiesTitle")}</span>}
          {facilities.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">{item.title}</span>
              {item.condition && <span className="text-xs text-muted-foreground">{item.condition}</span>}
            </div>
          ))}
          {facilities.length > 0 && movables.length > 0 && <span className="mt-2 text-sm font-medium">{t("itemsTitle")}</span>}
          {movables.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-sm">{item.title}</span>
              <div className="flex items-center gap-2">
                {item.condition && <span className="text-xs text-muted-foreground">{item.condition}</span>}
                <Badge variant="outline">
                  {t(`ownedBy${item.ownedBy === "owner" ? "Owner" : item.ownedBy === "renter" ? "Renter" : "Conditional"}`)}
                </Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
