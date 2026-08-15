"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export interface TenantAttachmentRow {
  id: string;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
  downloadUrl: string | null;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Read-only — tenants never upload/remove attachments here (ROADMAP Phase
// 2 item 4 scope decision). RLS (tenant_scope_attachments, migration 0017)
// already restricts these to the caller's own tenancy/person and hides
// soft-deleted rows, so this doesn't re-filter.
export function TenantAttachmentsList({ title, attachments }: { title: string; attachments: TenantAttachmentRow[] }) {
  const t = useTranslations("attachments");
  const format = useFormatter();

  if (attachments.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {attachments.map((a) => (
          <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-1 overflow-hidden">
              <span className="truncate text-sm font-medium">{a.fileName}</span>
              <span className="text-xs text-muted-foreground">
                {formatSize(a.sizeBytes)} · {t("uploadedOn", { date: format.dateTime(new Date(a.createdAt)) })}
              </span>
            </div>
            {a.downloadUrl && (
              <a href={a.downloadUrl} target="_blank" rel="noreferrer" className="shrink-0 text-sm text-primary underline">
                {t("download")}
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
