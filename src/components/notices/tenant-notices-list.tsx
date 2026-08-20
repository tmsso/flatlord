"use client";

import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import type { NoticeType } from "@/db/schema/notices";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export interface TenantNoticeRow {
  id: string;
  type: NoticeType;
  title: string;
  createdAt: string;
  requiresAcknowledgement: boolean;
  acknowledgedAt: string | null;
}

const TYPE_VARIANT: Record<NoticeType, "outline" | "secondary" | "destructive"> = {
  info: "outline",
  house_rule: "outline",
  payment_reminder: "secondary",
  late_payment: "destructive",
  formal_warning: "destructive",
  contract: "secondary",
};

// Read-only list — there's no "new notice" affordance here, unlike
// TenantRequestsList: notices are admin-issued only.
export function TenantNoticesList({ notices }: { notices: TenantNoticeRow[] }) {
  const t = useTranslations("notices");
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {notices.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {notices.map((n) => (
          <Link
            key={n.id}
            href={`/home/notices/${n.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted"
          >
            <div className="flex flex-col gap-1 overflow-hidden">
              <span className="truncate text-sm font-medium">{n.title}</span>
              <span className="text-xs text-muted-foreground">
                {t(`type_${n.type}`)} · {format.dateTime(new Date(n.createdAt))}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {n.requiresAcknowledgement && (
                <Badge variant={n.acknowledgedAt ? "secondary" : "outline"}>
                  {n.acknowledgedAt ? t("acknowledged") : t("acknowledgementRequired")}
                </Badge>
              )}
              <Badge variant={TYPE_VARIANT[n.type]}>{t(`type_${n.type}`)}</Badge>
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
