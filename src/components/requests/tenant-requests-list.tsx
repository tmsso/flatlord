"use client";

import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";
import { NewRequestDialog } from "@/components/requests/new-request-dialog";
import type { RequestItemOption } from "@/lib/requests/get-request-item-options";
import { RequestStatusBadge } from "@/components/status-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export interface TenantRequestRow {
  id: string;
  category: RequestCategory;
  status: RequestStatus;
  title: string;
  createdAt: string;
}


export function TenantRequestsList({ requests, itemOptions }: { requests: TenantRequestRow[]; itemOptions?: RequestItemOption[] }) {
  const t = useTranslations("requests");
  const format = useFormatter();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{t("title")}</CardTitle>
        <NewRequestDialog itemOptions={itemOptions} />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {requests.length === 0 && <p className="text-sm text-muted-foreground">{t("empty")}</p>}
        {requests.map((r) => (
          <Link
            key={r.id}
            href={`/home/requests/${r.id}`}
            className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted"
          >
            <div className="flex flex-col gap-1 overflow-hidden">
              <span className="truncate text-sm font-medium">{r.title}</span>
              <span className="text-xs text-muted-foreground">
                {t(`category_${r.category}`)} · {format.dateTime(new Date(r.createdAt))}
              </span>
            </div>
            <RequestStatusBadge status={r.status} label={t(`status_${r.status}`)} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
