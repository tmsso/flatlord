"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { Inbox } from "lucide-react";
import { REQUEST_CATEGORIES, REQUEST_STATUSES, type RequestCategory, type RequestStatus } from "@/db/schema/requests";
import { NewRequestDialog } from "@/components/requests/new-request-dialog";
import type { RequestItemOption } from "@/lib/requests/get-request-item-options";
import { RequestStatusBadge } from "@/components/status-badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface AdminRequestRow {
  id: string;
  category: RequestCategory;
  status: RequestStatus;
  title: string;
  createdAt: string;
  propertyId: string;
  propertyName: string;
  tenantName: string;
  externalCaseRef: string | null;
  appointmentDate: string | null;
}

// design/09 7c: status pills with counts (open first — the admin's work
// queue), category + property filters, dense table; a row opens the thread.
export function AdminRequestsDashboard({
  requests,
  tenancyOptions,
  itemOptions,
}: {
  requests: AdminRequestRow[];
  tenancyOptions: { id: string; label: string }[];
  itemOptions?: RequestItemOption[];
}) {
  const t = useTranslations("requests");
  const format = useFormatter();
  const router = useRouter();
  const [status, setStatus] = useState<RequestStatus | "all">("open");
  const [category, setCategory] = useState<RequestCategory | "all">("all");
  const [propertyId, setPropertyId] = useState<string | "all">("all");

  const properties = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of requests) seen.set(r.propertyId, r.propertyName);
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [requests]);

  const matchesOtherFilters = (r: AdminRequestRow) =>
    (category === "all" || r.category === category) && (propertyId === "all" || r.propertyId === propertyId);
  const countFor = (s: RequestStatus | "all") => requests.filter((r) => matchesOtherFilters(r) && (s === "all" || r.status === s)).length;
  const filtered = requests.filter((r) => matchesOtherFilters(r) && (status === "all" || r.status === status));

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>{t("title")}</CardTitle>
        <NewRequestDialog tenancyOptions={tenancyOptions} itemOptions={itemOptions} />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("statusLabel")} className="flex flex-wrap gap-1.5">
            {[...REQUEST_STATUSES, "all" as const].map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={status === s}
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-4xl border px-3 py-1 text-xs font-medium transition-colors",
                  status === s
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {s === "all" ? t("allStatuses") : t(`status_${s}`)} · {countFor(s)}
              </button>
            ))}
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Select value={category} onValueChange={(v) => v && setCategory(v as RequestCategory | "all")}>
              <SelectTrigger id="filterCategory" size="sm" className="w-44" aria-label={t("categoryLabel")}>
                <SelectValue>{(v: string) => (v === "all" ? t("allCategories") : t(`category_${v}`))}</SelectValue>
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
            {properties.length > 1 && (
              <Select value={propertyId} onValueChange={(v) => v && setPropertyId(v)}>
                <SelectTrigger id="filterProperty" size="sm" className="w-44" aria-label={t("propertyFilterLabel")}>
                  <SelectValue>{(v: string) => (v === "all" ? t("allProperties") : (properties.find((p) => p.id === v)?.name ?? v))}</SelectValue>
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
            )}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-10 text-center">
            <Inbox className="size-6 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("subjectColumn")}</TableHead>
                  <TableHead>{t("categoryLabel")}</TableHead>
                  <TableHead>{t("externalRefColumn")}</TableHead>
                  <TableHead>{t("appointmentColumn")}</TableHead>
                  <TableHead>{t("openedColumn")}</TableHead>
                  <TableHead className="text-right">{t("statusLabel")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id} className="cursor-pointer" onClick={() => router.push(`/requests/${r.id}`)}>
                    <TableCell className="max-w-80">
                      <Link href={`/requests/${r.id}`} className="block truncate font-medium" onClick={(e) => e.stopPropagation()}>
                        {r.title}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {r.propertyName} · {r.tenantName}
                      </span>
                    </TableCell>
                    <TableCell>{t(`category_${r.category}`)}</TableCell>
                    <TableCell className="font-mono text-xs">{r.externalCaseRef ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">
                      {r.appointmentDate
                        ? // Date-only in practice (the form collects a date, stored as
                          // UTC midnight) — format in UTC so the day never shifts.
                          format.dateTime(new Date(r.appointmentDate), { dateStyle: "medium", timeZone: "UTC" })
                        : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {format.dateTime(new Date(r.createdAt), { dateStyle: "medium" })}
                    </TableCell>
                    <TableCell className="text-right">
                      <RequestStatusBadge status={r.status} label={t(`status_${r.status}`)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
