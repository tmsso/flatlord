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
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>{t("issueNotice")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("issueNotice")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeTenancyId">{t("tenancyLabel")}</Label>
            <Select name="tenancyId" defaultValue={tenancyOptions[0]?.id}>
              <SelectTrigger id="noticeTenancyId">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeType">{t("typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as NoticeType)}>
              <SelectTrigger id="noticeType">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeTitle">{t("titleLabel")}</Label>
            <Input id="noticeTitle" name="title" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeBody">{t("bodyLabel")}</Label>
            <Textarea id="noticeBody" name="body" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeContractClauseRef">{t("contractClauseRefLabel")}</Label>
            <Input id="noticeContractClauseRef" name="contractClauseRef" />
          </div>
          {isFormalWarning && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="noticeSequence">{t("sequenceLabel")}</Label>
              <Select name="sequence" defaultValue="first">
                <SelectTrigger id="noticeSequence">
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
          {isFormalWarning && <p className="text-xs text-muted-foreground">{t("requiresAcknowledgementForcedNote")}</p>}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="noticeFile">{t("attachmentLabel")}</Label>
            <Input id="noticeFile" ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/webp" />
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
