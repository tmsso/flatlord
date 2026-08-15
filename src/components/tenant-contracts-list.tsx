"use client";

import { useTranslations, useFormatter } from "next-intl";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface TenantContractRow {
  id: string;
  version: number;
  status: "active" | "superseded";
  termStart: string | null;
  termEnd: string | null;
  documentUrl: string | null;
}

// Read-only — tenants never create/edit contracts. Only active/superseded
// versions ever reach this component; RLS (tenant_scope_contracts,
// migration 0015) already hides drafts, this doesn't re-filter.
export function TenantContractsList({ contracts }: { contracts: TenantContractRow[] }) {
  const t = useTranslations("contracts");
  const format = useFormatter();

  if (contracts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {contracts.map((c) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t("versionLabel", { version: c.version })}</span>
                <Badge variant="outline">{t(`status_${c.status}`)}</Badge>
              </div>
              <span className="text-xs text-muted-foreground">
                {c.termStart ? format.dateTime(new Date(c.termStart)) : "—"} –{" "}
                {c.termEnd ? format.dateTime(new Date(c.termEnd)) : t("noEndDate")}
              </span>
            </div>
            {c.documentUrl && (
              <a href={c.documentUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
                {t("download")}
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
