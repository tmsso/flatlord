"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { NOTICE_TYPES, type NoticeType } from "@/db/schema/notices";
import { IssueNoticeDialog } from "@/components/notices/issue-notice-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface AdminNoticeRow {
  id: string;
  type: NoticeType;
  title: string;
  createdAt: string;
  requiresAcknowledgement: boolean;
  acknowledgedAt: string | null;
  propertyId: string;
  propertyName: string;
  tenantName: string;
}

const TYPE_VARIANT: Record<NoticeType, "outline" | "secondary" | "destructive"> = {
  info: "outline",
  house_rule: "outline",
  payment_reminder: "secondary",
  late_payment: "destructive",
  formal_warning: "destructive",
  contract: "secondary",
};

export function AdminNoticesDashboard({
  notices,
  tenancyOptions,
}: {
  notices: AdminNoticeRow[];
  tenancyOptions: { id: string; label: string }[];
}) {
  const t = useTranslations("notices");
  const format = useFormatter();
  const [type, setType] = useState<NoticeType | "all">("all");
  const [propertyId, setPropertyId] = useState<string | "all">("all");

  const properties = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of notices) seen.set(n.propertyId, n.propertyName);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [notices]);

  const filtered = notices.filter(
    (n) => (type === "all" || n.type === type) && (propertyId === "all" || n.propertyId === propertyId),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <IssueNoticeDialog tenancyOptions={tenancyOptions} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterType">{t("typeLabel")}</Label>
            <Select value={type} onValueChange={(v) => v && setType(v as NoticeType | "all")}>
              <SelectTrigger id="filterType" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allTypes")}</SelectItem>
                {NOTICE_TYPES.map((nt) => (
                  <SelectItem key={nt} value={nt}>
                    {t(`type_${nt}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterProperty">{t("propertyFilterLabel")}</Label>
            <Select value={propertyId} onValueChange={(v) => v && setPropertyId(v)}>
              <SelectTrigger id="filterProperty" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allProperties")}</SelectItem>
                {properties.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filtered.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        <div className="flex flex-col gap-2">
          {filtered.map((n) => (
            <Link
              key={n.id}
              href={`/notices/${n.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted"
            >
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="truncate text-sm font-medium">{n.title}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`type_${n.type}`)} · {n.propertyName} · {n.tenantName} · {format.dateTime(new Date(n.createdAt))}
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
        </div>
      </CardContent>
    </Card>
  );
}
