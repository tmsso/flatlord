"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { addRequestMessage } from "@/server/requests/add-request-message";
import { withdrawRequest } from "@/server/requests/withdraw-request";
import { updateRequest } from "@/server/requests/update-request";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export interface RequestMessageRow {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  isOwnMessage: boolean;
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
}

const STATUS_VARIANT: Record<RequestStatus, "outline" | "secondary" | "destructive"> = {
  open: "outline",
  resolved: "secondary",
  rejected: "destructive",
  withdrawn: "secondary",
};

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
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSavingMeta, startSavingMeta] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const replyRef = useRef<HTMLTextAreaElement>(null);

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
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleWithdraw() {
    startTransition(async () => {
      try {
        await withdrawRequest({ id: request.id });
        toast.success(tc("save"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  function handleStatus(status: "resolved" | "rejected") {
    startTransition(async () => {
      try {
        await updateRequest({ id: request.id, status });
        toast.success(tc("save"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
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
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  const canWithdraw = role === "tenant" && request.status === "open";
  const canResolveOrReject = role === "owner" && request.status === "open";

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex flex-col gap-1">
            <CardTitle>{request.title}</CardTitle>
            <span className="text-xs text-muted-foreground">
              {t(`category_${request.category}`)} · {t("openedOn", { date: format.dateTime(new Date(request.createdAt)) })}
            </span>
          </div>
          <Badge variant={STATUS_VARIANT[request.status]}>{t(`status_${request.status}`)}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {request.description && <p className="text-sm">{request.description}</p>}
          {role === "owner" ? (
            <form onSubmit={handleMetaSave} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="externalCaseRef">{t("externalCaseRefLabel")}</Label>
                <Input id="externalCaseRef" name="externalCaseRef" defaultValue={request.externalCaseRef ?? ""} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="appointmentDate">{t("appointmentDateLabel")}</Label>
                <Input id="appointmentDate" name="appointmentDate" type="date" defaultValue={request.appointmentDate ?? ""} />
              </div>
              <Button type="submit" variant="outline" size="sm" disabled={isSavingMeta}>
                {tc("save")}
              </Button>
            </form>
          ) : (
            (request.externalCaseRef || request.appointmentDate) && (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {request.externalCaseRef && <span>{t("externalCaseRefLabel")}: {request.externalCaseRef}</span>}
                {request.appointmentDate && <span>{t("appointmentDateLabel")}: {request.appointmentDate}</span>}
              </div>
            )
          )}
          <div className="flex items-center gap-2 self-end">
            {canWithdraw && (
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={handleWithdraw}>
                {t("withdraw")}
              </Button>
            )}
            {canResolveOrReject && (
              <>
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => handleStatus("rejected")}>
                  {t("reject")}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => handleStatus("resolved")}>
                  {t("resolve")}
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
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col gap-1 rounded-lg border border-border p-3 ${m.isOwnMessage ? "self-end bg-muted" : "self-start"}`}
            >
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              <span className="text-xs text-muted-foreground">{format.dateTime(new Date(m.createdAt))}</span>
            </div>
          ))}
          <form onSubmit={handleReply} className="flex flex-col gap-2">
            <Textarea ref={replyRef} name="body" placeholder={t("replyPlaceholder")} required />
            <div className="flex items-center gap-2">
              <Input ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/heic,image/webp" className="max-w-xs" />
              <Button type="submit" size="sm" disabled={isPending}>
                {t("reply")}
              </Button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
