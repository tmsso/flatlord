"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronLeft, Paperclip } from "lucide-react";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { addRequestMessage } from "@/server/requests/add-request-message";
import { withdrawRequest } from "@/server/requests/withdraw-request";
import { updateRequest } from "@/server/requests/update-request";
import { approveFieldChange } from "@/server/field-editability/approve-field-change";
import { rejectRequest } from "@/server/requests/reject-request";
import { PERSON_EDITABLE_FIELDS, PERSON_SENSITIVE_FIELD_KEYS } from "@/lib/field-editability/person-fields";
import { maskId } from "@/lib/format/mask-id";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RequestStatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export interface RequestMessageRow {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  isOwnMessage: boolean;
  // Given name when the viewer may read the author's person row (RLS);
  // otherwise the bubble falls back to the author's role.
  authorName?: string | null;
}

export interface FieldChangePayload {
  entityType: "person";
  entityId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
}

export interface RequestDetail {
  id: string;
  category: RequestCategory;
  status: RequestStatus;
  title: string;
  description: string | null;
  externalCaseRef: string | null;
  appointmentDate: string | null;
  createdAt: string;
  // Present only for a change request auto-created by the field-editability
  // approval_required path (ROADMAP Phase 3 item 3) — a plain
  // tenant-opened request never has this.
  changePayload?: FieldChangePayload | null;
  // B-36: the inventory item / facility the request is about, if named.
  affectedItem?: { title: string; kind: "item" | "facility" } | null;
}


// role gates which actions render: tenant sees withdraw (own open request
// only); owner sees resolve/reject + the external-case-ref/appointment-
// date edit form. Both sides can post into the thread.
export function RequestThread({
  request,
  messages,
  role,
}: {
  request: RequestDetail;
  messages: RequestMessageRow[];
  role: "owner" | "tenant";
}) {
  const t = useTranslations("requests");
  const tc = useTranslations("common");
  const tPersonLabels = useTranslations("persons");
  const tErr = useTranslations("actionErrors");
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSavingMeta, startSavingMeta] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  // B-41: Reject first opens an optional note box; the second click rejects.
  const [isRejecting, setIsRejecting] = useState(false);
  const rejectNoteRef = useRef<HTMLTextAreaElement>(null);
  // appointment_date is timestamptz but collected as a date (stored as
  // UTC midnight): show and edit it as a date in UTC.
  const appointmentDay = request.appointmentDate ? request.appointmentDate.slice(0, 10) : "";
  const dateOnly = (d: string) => format.dateTime(new Date(`${d}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });
  const otherRoleLabel = role === "owner" ? t("authorTenant") : t("authorOwner");

  function handleReply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = replyRef.current?.value.trim();
    if (!body) return;
    const file = fileRef.current?.files?.[0];
    setError(null);
    startTransition(async () => {
      try {
        await addRequestMessage({ requestId: request.id, body }, file);
        toast.success(tc("save"));
        (e.target as HTMLFormElement).reset();
        setFileName(null);
        router.refresh();
      } catch {
        setError(t("errorGeneric"));
      }
    });
  }

  function handleWithdraw() {
    startTransition(async () => {
      try {
        await withdrawRequest({ id: request.id });
        toast.success(tc("save"));
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  function handleResolve() {
    startTransition(async () => {
      try {
        await updateRequest({ id: request.id, status: "resolved" });
        toast.success(tc("save"));
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  // A field-change request must never go through the generic "resolve"
  // transition above — that would mark it done without ever writing the
  // value. This is the only path that applies changePayload to the target
  // entity (see approve-field-change.ts).
  function handleApprove() {
    startTransition(async () => {
      try {
        await approveFieldChange(request.id);
        toast.success(tc("save"));
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  // Both plain and field-change requests reject through rejectRequest, which
  // never touches the target entity.
  function handleReject() {
    const note = rejectNoteRef.current?.value.trim() || undefined;
    startTransition(async () => {
      try {
        const result = await rejectRequest({ id: request.id, note });
        if (!result.ok) {
          toast.error(tErr(result.error));
          return;
        }
        toast.success(tc("save"));
        setIsRejecting(false);
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  function handleMetaSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startSavingMeta(async () => {
      try {
        await updateRequest({
          id: request.id,
          externalCaseRef: (String(data.get("externalCaseRef") ?? "").trim() || null) as string | null,
          appointmentDate: (String(data.get("appointmentDate") ?? "").trim() || null) as string | null,
        });
        toast.success(tc("save"));
        router.refresh();
      } catch {
        toast.error(t("errorGeneric"));
      }
    });
  }

  const canWithdraw = role === "tenant" && request.status === "open" && !request.changePayload;
  const canResolveOrReject = role === "owner" && request.status === "open" && !request.changePayload;
  const canApproveOrReject = role === "owner" && request.status === "open" && !!request.changePayload;

  const changePayload = request.changePayload;
  const changeFieldDef = changePayload ? PERSON_EDITABLE_FIELDS.find((f) => f.key === changePayload.fieldName) : undefined;
  const changeFieldLabel = changePayload ? (changeFieldDef ? tPersonLabels(changeFieldDef.labelKey) : changePayload.fieldName) : "";
  const isSensitiveChange = changePayload ? PERSON_SENSITIVE_FIELD_KEYS.has(changePayload.fieldName) : false;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Link
                href={role === "owner" ? "/requests" : "/home/requests"}
                aria-label={t("back")}
                className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </Link>
              <CardTitle className="truncate">{request.title}</CardTitle>
            </div>
            {/* design/09 7b meta line: category · external ref · appointment · opened */}
            <span className="text-xs text-muted-foreground">
              {[
                t(`category_${request.category}`),
                request.externalCaseRef ? `${t("externalRefColumn")}: ${request.externalCaseRef}` : null,
                appointmentDay ? `${t("appointmentColumn")}: ${dateOnly(appointmentDay)}` : null,
                t("openedOn", { date: format.dateTime(new Date(request.createdAt), { dateStyle: "medium" }) }),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <RequestStatusBadge status={request.status} label={t(`status_${request.status}`)} />
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {request.affectedItem && (
            <p className="text-sm">
              <span className="text-muted-foreground">
                {request.affectedItem.kind === "facility" ? t("affectedFacility") : t("affectedItemLabel")}:
              </span>{" "}
              <span className="font-medium">{request.affectedItem.title}</span>
            </p>
          )}
          {changePayload && (
            // design/09 9: current (struck through) → proposed (success tint).
            // Owner view is the CLAUDE.md §6 "admin detail view" masking
            // exception — shows raw values. Tenant view (their own request)
            // still masks, same as the rest of their profile page.
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t("changeRequestDiffTitle", { field: changeFieldLabel })}</p>
              <div className="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr]">
                <div className="rounded-md border border-border bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{t("changeRequestOld")}</p>
                  <p className="text-sm text-muted-foreground line-through">
                    {isSensitiveChange && role === "tenant" ? (maskId(changePayload.oldValue) ?? "—") : (changePayload.oldValue ?? "—")}
                  </p>
                </div>
                <span className="hidden self-center text-muted-foreground sm:block" aria-hidden="true">
                  →
                </span>
                <div className="rounded-md border border-success-border bg-success-bg p-3">
                  <p className="text-xs text-success">{t("changeRequestNew")}</p>
                  <p className="text-sm font-medium">
                    {isSensitiveChange && role === "tenant" ? (maskId(changePayload.newValue) ?? "—") : (changePayload.newValue ?? "—")}
                  </p>
                </div>
              </div>
            </div>
          )}
          {request.description && <p className="text-sm">{request.description}</p>}
          {role === "owner" ? (
            <form
              // Remount on saved values so the uncontrolled inputs pick up
              // the refreshed defaults (Base UI warns on a changing defaultValue).
              key={`${request.externalCaseRef ?? ""}|${appointmentDay}`}
              onSubmit={handleMetaSave}
              className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="externalCaseRef">{t("externalCaseRefLabel")}</Label>
                <Input id="externalCaseRef" name="externalCaseRef" defaultValue={request.externalCaseRef ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="appointmentDate">{t("appointmentDateLabel")}</Label>
                <Input id="appointmentDate" name="appointmentDate" type="date" defaultValue={appointmentDay} />
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={isSavingMeta}>
                {tc("save")}
              </Button>
            </form>
          ) : null}
          {isRejecting && (canResolveOrReject || canApproveOrReject) && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rejectNote">{t("rejectNoteLabel")}</Label>
              <Textarea id="rejectNote" ref={rejectNoteRef} name="rejectNote" rows={3} maxLength={2000} autoFocus />
            </div>
          )}
          <div className="flex items-center gap-2 self-end">
            {isRejecting && (canResolveOrReject || canApproveOrReject) && (
              <>
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setIsRejecting(false)}>
                  {tc("cancel")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-destructive-border text-destructive hover:text-destructive"
                  disabled={isPending}
                  onClick={handleReject}
                >
                  {t("rejectConfirm")}
                </Button>
              </>
            )}
            {canWithdraw && (
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleWithdraw}>
                {t("withdraw")}
              </Button>
            )}
            {canResolveOrReject && !isRejecting && (
              <>
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => setIsRejecting(true)}>
                  {t("reject")}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={handleResolve}>
                  {t("resolve")}
                </Button>
              </>
            )}
            {canApproveOrReject && !isRejecting && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive-border text-destructive hover:text-destructive"
                  disabled={isPending}
                  onClick={() => setIsRejecting(true)}
                >
                  {t("reject")}
                </Button>
                <Button type="button" disabled={isPending} onClick={handleApprove}>
                  {t("approveApplyNotify")}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("threadTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {messages.length === 0 && <p className="text-sm text-muted-foreground">{t("threadEmpty")}</p>}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex max-w-[85%] flex-col gap-1 rounded-lg border p-3",
                m.isOwnMessage ? "self-end border-primary/20 bg-primary/5" : "self-start border-border bg-card",
              )}
            >
              <span className="text-xs font-medium">
                {m.isOwnMessage ? t("you") : (m.authorName ?? otherRoleLabel)}
                <span className="font-normal text-muted-foreground"> · {format.dateTime(new Date(m.createdAt), { dateStyle: "medium", timeStyle: "short" })}</span>
              </span>
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
            </div>
          ))}
          <form onSubmit={handleReply} className="flex flex-col gap-1.5">
            <div className="flex items-end gap-2">
              <label
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border text-muted-foreground hover:bg-muted"
                title={t("attachFile")}
              >
                <Paperclip className="size-4" aria-hidden="true" />
                <span className="sr-only">{t("attachFile")}</span>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
                  className="sr-only"
                  onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                />
              </label>
              <Textarea
                ref={replyRef}
                name="body"
                rows={1}
                placeholder={t("replyPlaceholder")}
                required
                className="min-h-10 rounded-2xl py-2.5"
              />
              <Button type="submit" size="icon" className="size-10 shrink-0 rounded-full" disabled={isPending} aria-label={t("reply")}>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
            {fileName && <p className="pl-12 text-xs text-muted-foreground">{t("attached", { name: fileName })}</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
