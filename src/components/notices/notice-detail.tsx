"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { acknowledgeNotice } from "@/server/notices/acknowledge-notice";
import type { NoticeType, NoticeSequence } from "@/db/schema/notices";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NOTICE_TYPE_VARIANT } from "@/lib/notices/notice-type-variant";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";

export interface NoticeDetailData {
  id: string;
  type: NoticeType;
  title: string;
  body: string;
  contractClauseRef: string | null;
  sequence: NoticeSequence | null;
  requiresAcknowledgement: boolean;
  acknowledgedAt: string | null;
  createdAt: string;
}

// No thread, no edit/withdraw actions — unlike RequestThread, a notice is
// a one-shot immutable admin->tenant announcement (CLAUDE.md §3.8). The
// only interactive affordance is the tenant's acknowledge button, gated
// on requiresAcknowledgement (RLS would deny the attempt otherwise —
// acknowledge-notice.ts's tenant_acknowledge_notices policy, migration
// 0020) and on it not already being acknowledged.
export function NoticeDetail({ notice, role }: { notice: NoticeDetailData; role: "owner" | "tenant" }) {
  const t = useTranslations("notices");
  const format = useFormatter();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [readConfirmed, setReadConfirmed] = useState(false);

  function handleAcknowledge() {
    startTransition(async () => {
      try {
        await acknowledgeNotice({ id: notice.id });
        toast.success(t("acknowledge"));
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("errorGeneric"));
      }
    });
  }

  const canAcknowledge = role === "tenant" && notice.requiresAcknowledgement && !notice.acknowledgedAt;

  // design/09 8b: type · sequence pill, clause · date line, full text in a
  // read-only scroll box, then (tenant, formal) an explicit "read and
  // understood" checkbox gating the confirm button.
  const typeLabel = notice.sequence ? `${t(`type_${notice.type}`)} · ${t(`sequence_${notice.sequence}`)}` : t(`type_${notice.type}`);
  return (
    <Card>
      <CardHeader className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={NOTICE_TYPE_VARIANT[notice.type]}>{typeLabel}</Badge>
          <span className="text-xs text-muted-foreground">
            {[
              notice.contractClauseRef ? `${t("contractClauseShort")} ${notice.contractClauseRef}` : null,
              format.dateTime(new Date(notice.createdAt), { dateStyle: "medium" }),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
        <CardTitle>{notice.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="max-h-[50vh] overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
          <p className="text-sm whitespace-pre-wrap">{notice.body}</p>
        </div>
        {notice.requiresAcknowledgement && notice.acknowledgedAt && (
          <p className="flex items-center gap-1.5 text-sm text-success">
            <Check className="size-4" aria-hidden="true" />
            {t("acknowledgedOn", { date: format.dateTime(new Date(notice.acknowledgedAt), { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
        )}
        {notice.requiresAcknowledgement && !notice.acknowledgedAt && role === "owner" && (
          <p className="text-sm text-muted-foreground">{t("notAcknowledgedYet")}</p>
        )}
        {canAcknowledge && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Checkbox id="noticeReadConfirmed" checked={readConfirmed} onCheckedChange={(c) => setReadConfirmed(c === true)} />
              <Label htmlFor="noticeReadConfirmed" className="font-normal">
                {t("ackCheckbox")}
              </Label>
            </div>
            <Button type="button" className="h-11 w-full" disabled={isPending || !readConfirmed} onClick={handleAcknowledge}>
              {t("ackConfirm")}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          {notice.requiresAcknowledgement ? t("ackLoggedNote") : t("immutableNote")}
        </p>
      </CardContent>
    </Card>
  );
}
