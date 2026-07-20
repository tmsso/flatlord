"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import { createDraftStatement } from "@/server/billing/create-draft-statement";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MonthPicker } from "@/components/month-picker";
import { StatementStatusBadge, type StatementDisplayStatus } from "@/components/status-badge";
import { deriveStatementDisplayStatus, type StoredStatementStatus } from "@/lib/billing/derive-statement-display-status";

interface StatementRow {
  id: string;
  periodMonth: string;
  status: StoredStatementStatus;
  dueDate: string | null;
  total: number;
  tenantName: string;
}

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function StatementsList({
  statements,
  activeTenancyId,
  today,
}: {
  statements: StatementRow[];
  activeTenancyId: string | null;
  today: string;
}) {
  const t = useTranslations("statements");
  const format = useFormatter();
  const router = useRouter();
  const [draftMonth, setDraftMonth] = useState(currentMonthStart());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleCreateDraft() {
    if (!activeTenancyId) return;
    setError(null);
    startTransition(async () => {
      try {
        const { statementId } = await createDraftStatement({ tenancyId: activeTenancyId, periodMonth: draftMonth });
        router.push(`/statements/${statementId}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : t("errorGeneric");
        setError(message);
        toast.error(message);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthPicker value={draftMonth} onChange={setDraftMonth} />
        <Button type="button" onClick={handleCreateDraft} disabled={isPending || !activeTenancyId}>
          {t("createDraft")}
        </Button>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("listMonth")}</TableHead>
            <TableHead>{t("listTenant")}</TableHead>
            <TableHead>{t("listStatus")}</TableHead>
            <TableHead className="text-right">{t("listTotal")}</TableHead>
            <TableHead>{t("listDue")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {statements.map((s) => {
            const displayStatus: StatementDisplayStatus = deriveStatementDisplayStatus(s.status, s.dueDate, today);
            return (
              <TableRow key={s.id}>
                <TableCell>
                  <Link href={`/statements/${s.id}`} className="font-medium hover:underline">
                    {format.dateTime(new Date(`${s.periodMonth}T00:00:00Z`), { year: "numeric", month: "long", timeZone: "UTC" })}
                  </Link>
                </TableCell>
                <TableCell>{s.tenantName}</TableCell>
                <TableCell>
                  <StatementStatusBadge status={displayStatus} label={t(`status${capitalize(displayStatus)}`)} />
                </TableCell>
                <TableCell className="text-right tabular-figures">
                  {format.number(s.total, { style: "currency", currency: "HUF", maximumFractionDigits: 0 })}
                </TableCell>
                <TableCell className="tabular-figures">
                  {s.dueDate ? format.dateTime(new Date(`${s.dueDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" }) : "—"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function capitalize(s: string): string {
  return s
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
