"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { submitReconfirmationResponse } from "@/server/inventory/submit-reconfirmation-response";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface TenantInventoryItemRow {
  id: string;
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
function ReconfirmationRow({ row, onResponded }: { row: TenantReconfirmationItemRow; onResponded: () => void }) {
  const t = useTranslations("inventory");
  const [note, setNote] = useState("");
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

  if (row.status !== "pending") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border p-3">
        <span className="text-sm">{row.itemTitle}</span>
        <Badge variant={row.status === "discrepancy" ? "destructive" : "secondary"}>{t(`reconfirmationStatus_${row.status}`)}</Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <span className="text-sm font-medium">{row.itemTitle}</span>
      <Input
        type="text"
        placeholder={t("tenantNotePlaceholder")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`reconfirmPhoto-${row.id}`} className="text-xs text-muted-foreground">
          {t("photoOptionalLabel")}
        </Label>
        <Input id={`reconfirmPhoto-${row.id}`} ref={fileRef} type="file" accept="image/jpeg,image/png,image/heic,image/webp" />
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={isPending} onClick={() => respond("confirmed")}>
          {t("confirmMatches")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={isPending} onClick={() => respond("discrepancy")}>
          {t("flagDiscrepancy")}
        </Button>
      </div>
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
  const router = useRouter();

  return (
    <div className="flex flex-col gap-4">
      {activeCampaign && (
        <Card>
          <CardHeader>
            <CardTitle>{t("reconfirmationTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {activeCampaign.dueDate ? t("reconfirmationDueBy", { date: activeCampaign.dueDate }) : t("reconfirmationNoDueDate")}
            </p>
            {activeCampaign.items.map((row) => (
              <ReconfirmationRow key={row.id} row={row} onResponded={() => router.refresh()} />
            ))}
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
          {items.map((item) => (
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
