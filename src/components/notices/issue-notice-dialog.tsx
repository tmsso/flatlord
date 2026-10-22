"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { issueNotice } from "@/server/notices/issue-notice";
import { NOTICE_TYPES, NOTICE_SEQUENCES, type NoticeType, type NoticeSequence } from "@/db/schema/notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// Owner-only (mirrors new-request-dialog.tsx's admin half — notices have
// no tenant-initiated path, unlike requests). sequence/contractClauseRef
// are only meaningful for formal_warning; the form only renders/submits
// sequence when that type is selected (server also re-validates the
// pairing, issue-notice.ts). requiresAcknowledgement is forced true+
// disabled in the UI for formal_warning so there's no way to issue one
// without it, matching the task's hard requirement.
export function IssueNoticeDialog({ tenancyOptions }: { tenancyOptions: { id: string; label: string }[] }) {
  const t = useTranslations("notices");
  const tc = useTranslations("common");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<NoticeType>("info");
  const [requiresAck, setRequiresAck] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const isFormalWarning = type === "formal_warning";

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const title = String(data.get("title") ?? "").trim();
    const body = String(data.get("body") ?? "").trim();
    if (!title || !body) return;
    const file = fileRef.current?.files?.[0];
    setError(null);
    startTransition(async () => {
      try {
        await issueNotice(
          {
            tenancyId: String(data.get("tenancyId") ?? ""),
            type,
            title,
            body,
            contractClauseRef: (String(data.get("contractClauseRef") ?? "").trim() || null) as string | null,
            sequence: isFormalWarning ? ((String(data.get("sequence") ?? "") || null) as NoticeSequence | null) : null,
            requiresAcknowledgement: isFormalWarning ? true : requiresAck,
          },
          file,
        );
        toast.success(tc("save"));
        setOpen(false);
        (e.target as HTMLFormElement).reset();
        setType("info");
        setRequiresAck(false);
        setFileName(null);
        router.refresh();
      } catch {
        setError(t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("issueNotice")}</DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("issueNotice")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeTenancyId">{t("tenancyLabel")}</Label>
            <Select
              name="tenancyId"
              defaultValue={tenancyOptions[0]?.id}
              items={tenancyOptions.map((opt) => ({ value: opt.id, label: opt.label }))}
            >
              <SelectTrigger id="noticeTenancyId" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tenancyOptions.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {/* design/09 8a: type + sequence side by side */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="noticeType">{t("typeLabel")}</Label>
              <Select
                value={type}
                onValueChange={(v) => v && setType(v as NoticeType)}
                items={NOTICE_TYPES.map((nt) => ({ value: nt, label: t(`type_${nt}`) }))}
              >
                <SelectTrigger id="noticeType" className={cn("w-full", isFormalWarning && "font-medium text-destructive")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {NOTICE_TYPES.map((nt) => (
                    <SelectItem key={nt} value={nt}>
                      {t(`type_${nt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isFormalWarning && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="noticeSequence">{t("sequenceLabel")}</Label>
                <Select
                  name="sequence"
                  defaultValue="first"
                  items={NOTICE_SEQUENCES.map((s) => ({ value: s, label: t(`sequence_${s}`) }))}
                >
                  <SelectTrigger id="noticeSequence" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTICE_SEQUENCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`sequence_${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeTitle">{t("titleLabel")}</Label>
            <Input id="noticeTitle" name="title" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeBody">{t("bodyLabel")}</Label>
            <Textarea id="noticeBody" name="body" required className="max-h-64" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeContractClauseRef">{t("contractClauseRefLabel")}</Label>
            <Input id="noticeContractClauseRef" name="contractClauseRef" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="noticeRequiresAck"
              checked={isFormalWarning || requiresAck}
              onCheckedChange={(checked) => setRequiresAck(checked === true)}
              disabled={isFormalWarning}
            />
            <Label htmlFor="noticeRequiresAck" className="font-normal">
              {t("requiresAcknowledgementLabel")}
            </Label>
          </div>
          {isFormalWarning && (
            <p className="flex items-start gap-2 rounded-md border border-destructive-border bg-destructive-bg p-2.5 text-xs text-destructive">
              <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              {t("formalWarningBanner")}
            </p>
          )}
          <label
            htmlFor="noticeFile"
            className="flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-input bg-muted/40 px-3 py-2 text-center text-sm text-muted-foreground hover:bg-muted"
          >
            <span>{fileName ?? t("attachmentLabel")}</span>
            <input
              id="noticeFile"
              ref={fileRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
              className="sr-only"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
            />
          </label>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            {/* A formal warning is a serious, immutable act: red send. */}
            <Button type="submit" variant={isFormalWarning ? "destructive" : "default"} disabled={isPending}>
              {t("sendInAppEmail")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
