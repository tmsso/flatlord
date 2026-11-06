"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { takeHandoverSnapshot } from "@/server/handover/take-handover-snapshot";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface HandoverSnapshotRow {
  id: string;
  kind: "move_in" | "move_out";
  takenAt: string;
  itemCount: number;
  meterCount: number;
}

// B-13: handover snapshots for a tenancy — list with PDF links (owner and
// tenant, D-49) and, for the owner, "take snapshot".
export function HandoverSection({ tenancyId, snapshots, canTake }: { tenancyId: string; snapshots: HandoverSnapshotRow[]; canTake: boolean }) {
  const t = useTranslations("handover");
  const format = useFormatter();
  const router = useRouter();
  const [kind, setKind] = useState<"move_in" | "move_out">(snapshots.some((s) => s.kind === "move_in") ? "move_out" : "move_in");
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const kindItems = [
    { value: "move_in", label: t("kind.move_in") },
    { value: "move_out", label: t("kind.move_out") },
  ];

  function handleTake() {
    startTransition(async () => {
      try {
        await takeHandoverSnapshot({ tenancyId, kind, note: note || undefined });
        toast.success(t("taken"));
        setNote("");
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  if (!canTake && snapshots.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{t("description")}</p>
        {snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {snapshots.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{t(`kind.${s.kind}`)}</span>
                  {" · "}
                  {format.dateTime(new Date(s.takenAt), { dateStyle: "medium", timeStyle: "short" })}
                  {" · "}
                  <span className="text-muted-foreground">{t("counts", { items: s.itemCount, meters: s.meterCount })}</span>
                </span>
                <a className="text-primary underline-offset-4 hover:underline" href={`/api/handover-snapshots/${s.id}/pdf`}>
                  {t("downloadPdf")}
                </a>
              </li>
            ))}
          </ul>
        )}
        {canTake && (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handoverKind">{t("kindLabel")}</Label>
              <Select value={kind} onValueChange={(v) => v && setKind(v as "move_in" | "move_out")} items={kindItems}>
                <SelectTrigger id="handoverKind" className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {kindItems.map((k) => (
                    <SelectItem key={k.value} value={k.value}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="handoverSnapshotNote">{t("noteLabel")}</Label>
              <Textarea id="handoverSnapshotNote" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button type="button" onClick={handleTake} disabled={isPending} className="self-start">
              {t("take")}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
