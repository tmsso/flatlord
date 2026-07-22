"use client";

import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/status-badge";
import { Clock } from "lucide-react";

interface BatchRow {
  tenancyId: string;
  month: string;
  tenantName: string;
  propertyName: string;
  submittedCount: number;
}

export function MeterBatchesList({ batches }: { batches: BatchRow[] }) {
  const t = useTranslations("meterReadings");
  const tNav = useTranslations("nav");
  const tStatements = useTranslations("statements");
  const format = useFormatter();

  if (batches.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("statusDone")}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("monthPicker")}</TableHead>
          <TableHead>{tStatements("listTenant")}</TableHead>
          <TableHead>{tNav("properties")}</TableHead>
          <TableHead>{tStatements("listStatus")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((b) => (
          <TableRow key={`${b.tenancyId}:${b.month}`}>
            <TableCell>
              <Link href={`/meters/${b.tenancyId}?month=${b.month}`} className="font-medium hover:underline">
                {format.dateTime(new Date(`${b.month}-01T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" })}
              </Link>
            </TableCell>
            <TableCell>{b.tenantName}</TableCell>
            <TableCell>{b.propertyName}</TableCell>
            <TableCell>
              {b.submittedCount > 0 ? (
                <StatusPill tone="warning" icon={Clock}>
                  {t("statusSubmitted")} ({b.submittedCount})
                </StatusPill>
              ) : (
                <span className="text-sm text-muted-foreground">{t("statusVerified")}</span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
