"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { REQUEST_CATEGORIES, REQUEST_STATUSES, type RequestCategory, type RequestStatus } from "@/db/schema/requests";
import { NewRequestDialog } from "@/components/requests/new-request-dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface AdminRequestRow {
  id: string;
  category: RequestCategory;
  status: RequestStatus;
  title: string;
  createdAt: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
}

const STATUS_VARIANT: Record<RequestStatus, "outline" | "secondary" | "destructive"> = {
  open: "outline",
  resolved: "secondary",
  rejected: "destructive",
  withdrawn: "secondary",
};

export function AdminRequestsDashboard({
  requests,
  tenancyOptions,
}: {
  requests: AdminRequestRow[];
  tenancyOptions: { id: string; label: string }[];
}) {
  const t = useTranslations("requests");
  const format = useFormatter();
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [category, setCategory] = useState<RequestCategory | "all">("all");
  const [propertyId, setPropertyId] = useState<string | "all">("all");

  const properties = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of requests) seen.set(r.propertyId, r.propertyName);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [requests]);

  const filtered = requests.filter(
    (r) =>
      (status === "all" || r.status === status) &&
      (category === "all" || r.category === category) &&
      (propertyId === "all" || r.propertyId === propertyId),
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <NewRequestDialog tenancyOptions={tenancyOptions} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterStatus">{t("statusLabel")}</Label>
            <Select value={status} onValueChange={(v) => v && setStatus(v as RequestStatus | "all")}>
              <SelectTrigger id="filterStatus" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allStatuses")}</SelectItem>
                {REQUEST_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status_${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filterCategory">{t("categoryLabel")}</Label>
            <Select value={category} onValueChange={(v) => v && setCategory(v as RequestCategory | "all")}>
              <SelectTrigger id="filterCategory" className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allCategories")}</SelectItem>
                {REQUEST_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {t(`category_${c}`)}
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
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/requests/${r.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted"
            >
              <div className="flex flex-col gap-1 overflow-hidden">
                <span className="truncate text-sm font-medium">{r.title}</span>
                <span className="text-xs text-muted-foreground">
                  {t(`category_${r.category}`)} · {r.propertyName} · {r.tenantName} ·{" "}
                  {format.dateTime(new Date(r.createdAt))}
                </span>
              </div>
              <Badge variant={STATUS_VARIANT[r.status]}>{t(`status_${r.status}`)}</Badge>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
