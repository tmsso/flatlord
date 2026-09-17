"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AttachmentChip } from "@/components/ui/attachment-chip";

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
      <CardContent className="flex flex-wrap gap-2">
        {attachments.map((a) => (
          <span key={a.id} title={t("uploadedOn", { date: format.dateTime(new Date(a.createdAt)) })}>
            <AttachmentChip fileName={a.fileName} sizeLabel={formatSize(a.sizeBytes)} href={a.downloadUrl} />
          </span>
        ))}
      </CardContent>
    </Card>
  );
}
