"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { uploadAttachment } from "@/server/attachments/upload-attachment";
import { deleteAttachment } from "@/server/attachments/delete-attachment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export interface AttachmentRow {
  id: string;
  fileName: string;
  sizeBytes: number;
  note: string | null;
  createdAt: string;
  downloadUrl: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Admin-only: upload + list + soft-delete. Reused across any entity type
// the `attachments` table supports (ROADMAP Phase 2 item 4) — the caller
// just supplies which entity this panel is scoped to.
export function AttachmentsSection({
  entityType,
  entityId,
  attachments,
}: {
  entityType: "tenancy" | "person";
  entityId: string;
  attachments: AttachmentRow[];
}) {
  const t = useTranslations("attachments");
  const tc = useTranslations("common");
  const format = useFormatter();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleting] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError(t("fileRequired"));
      return;
    }
    setError(null);
    const note = String(data.get("note") ?? "").trim();
    startTransition(async () => {
      try {
        await uploadAttachment({ entityType, entityId, note: note || null }, file);
        toast.success(tc("save"));
        setOpen(false);
        form.reset();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleDelete(id: string) {
    startDeleting(async () => {
      try {
        await deleteAttachment({ id });
        toast.success(tc("save"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("upload")}</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t("upload")}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleUpload} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="attachmentFile">{t("fileLabel")}</Label>
                <Input
                  id="attachmentFile"
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="attachmentNote">{t("noteLabel")}</Label>
                <Input id="attachmentNote" name="note" type="text" />
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
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {attachments.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {attachments.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-1 overflow-hidden">
              <span className="truncate text-sm font-medium">{a.fileName}</span>
              <span className="text-xs text-muted-foreground">
                {formatSize(a.sizeBytes)} · {t("uploadedOn", { date: format.dateTime(new Date(a.createdAt)) })}
                {a.note && ` · ${a.note}`}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {a.downloadUrl && (
                <a href={a.downloadUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                  {t("download")}
                </a>
              )}
              <Button type="button" variant="ghost" size="sm" disabled={isDeleting} onClick={() => handleDelete(a.id)}>
                {t("remove")}
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
