"use client";

import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatementStatusBadge, type StatementDisplayStatus } from "@/components/status-badge";
import { deriveStatementDisplayStatus, type StoredStatementStatus } from "@/lib/billing/derive-statement-display-status";

interface StatementRow {
  id: string;
  periodMonth: string;
  status: StoredStatementStatus;
  dueDate: string | null;
  total: number;
}

function capitalize(s: string): string {
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

export function TenantStatementsList({ statements, today }: { statements: StatementRow[]; today: string }) {
  const t = useTranslations("statements");
  const format = useFormatter();

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("listMonth")}</TableHead>
          <TableHead>{t("listStatus")}</TableHead>
          <TableHead className="text-right">{t("listTotal")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {statements.map((s) => {
          const displayStatus: StatementDisplayStatus = deriveStatementDisplayStatus(s.status, s.dueDate, today);
          return (
            <TableRow key={s.id}>
              <TableCell>
                <Link href={`/home/statements/${s.id}`} className="font-medium hover:underline">
                  {format.dateTime(new Date(`${s.periodMonth}T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" })}
                </Link>
              </TableCell>
              <TableCell>
                <StatementStatusBadge status={displayStatus} label={t(`status${capitalize(displayStatus)}`)} />
              </TableCell>
              <TableCell className="text-right tabular-figures">
                {format.number(s.total, { style: "currency", currency: "HUF", maximumFractionDigits: 0 })}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
