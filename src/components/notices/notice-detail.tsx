"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { acknowledgeNotice } from "@/server/notices/acknowledge-notice";
import type { NoticeType, NoticeSequence } from "@/db/schema/notices";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

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

const TYPE_VARIANT: Record<NoticeType, "outline" | "secondary" | "destructive"> = {
  info: "outline",
  house_rule: "outline",
  payment_reminder: "secondary",
  late_payment: "destructive",
  formal_warning: "destructive",
  contract: "secondary",
};

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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex flex-col gap-1">
          <CardTitle>{notice.title}</CardTitle>
          <span className="text-xs text-muted-foreground">
            {t(`type_${notice.type}`)}
            {notice.sequence && ` · ${t(`sequence_${notice.sequence}`)}`}
            {" · "}
            {t("issuedOn", { date: format.dateTime(new Date(notice.createdAt)) })}
          </span>
        </div>
        <Badge variant={TYPE_VARIANT[notice.type]}>{t(`type_${notice.type}`)}</Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm whitespace-pre-wrap">{notice.body}</p>
        {notice.contractClauseRef && (
          <p className="text-xs text-muted-foreground">
            {t("contractClauseRefLabel")}: {notice.contractClauseRef}
          </p>
        )}
        {notice.requiresAcknowledgement && (
          <div className="flex items-center gap-2">
            {notice.acknowledgedAt ? (
              <Badge variant="secondary">{t("acknowledgedOn", { date: format.dateTime(new Date(notice.acknowledgedAt)) })}</Badge>
            ) : (
              <Badge variant="outline">{t("notAcknowledgedYet")}</Badge>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t("immutableNote")}</p>
          {canAcknowledge && (
            <Button type="button" size="sm" disabled={isPending} onClick={handleAcknowledge}>
              {t("acknowledge")}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
