import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenancyChartData } from "@/lib/billing/get-tenancy-chart-data";
import { isStatementOverdue, type StoredStatementStatus } from "@/lib/billing/is-statement-overdue";

export interface DashboardStatement {
  id: string;
  periodMonth: string;
  status: StoredStatementStatus;
  dueDate: string | null;
  issuedAt: string | null;
  total: number;
  paidSum: number;
  overdue: boolean;
}

export type NeedsAttentionKind = "approval" | "request" | "inventory";

export interface NeedsAttentionItem {
  id: string;
  kind: NeedsAttentionKind;
  title: string;
  subtitle: string;
  date: string;
  href: string;
}

export interface DashboardData {
  // null when the admin has no active tenancy at all (no property let, or
  // a brand-new property with nothing signed yet) — every widget below is
  // optional/empty in that case, there is nothing wrong with rendering a
  // dashboard with nothing on it.
  tenancy: {
    id: string;
    propertyName: string;
    addressLine: string | null;
    primaryTenantName: string;
    occupantCount: number;
    termEnd: string | null;
    dueDay: number;
    contract: { version: number; termEnd: string | null; noticeDays: number | null } | null;
  } | null;
  recentStatements: DashboardStatement[];
  outstanding: { totalRemaining: number; count: number; earliestDueDate: string | null } | null;
  mostOverdue: DashboardStatement | null;
  lastPayment: { amount: number; paidAt: string; method: string } | null;
  currentCycle: {
    periodMonth: string;
    metersTotal: number;
    metersVerified: number;
    statement: DashboardStatement | null;
  } | null;
  needsAttention: NeedsAttentionItem[];
  chart: Awaited<ReturnType<typeof getTenancyChartData>> | null;
  draftCount: number;
}

function periodBounds(periodMonth: string): { start: string; end: string } {
  const [year, month] = periodMonth.split("-").map(Number);
  const end = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
  return { start: `${periodMonth.slice(0, 7)}-01`, end };
}

// Backs the Phase 4c admin dashboard (design/04, ROADMAP item 2). All
// queries are grouped into Promise.all stages per BACKLOG.md B-02 — see
// the comments at each stage boundary for what depends on what.
//
// Scoping note: this app's UI still assumes one property/one tenancy in
// practice (ROADMAP handoff notes) even though the schema is already
// multi-property-ready. When an owner has more than one active tenancy
// this picks the most recently started one — real multi-property
// dashboarding (a picker, aggregated widgets) is Phase 5 scope
// (`second property onboarding`), not this batch.
export async function getDashboardData(
  supabase: SupabaseClient,
  personId: string,
  today: string,
  // Scopes only the billing-cycle stepper widget to a specific
  // "YYYY-MM-01" period (the dashboard's month-picker control) — every
  // other widget (outstanding, needs-attention, recent statements,
  // charts) always reflects the actual current state, not the browsed
  // month. Browsing "did June's cycle complete" shouldn't change what
  // "currently outstanding" means.
  viewMonth?: string,
): Promise<DashboardData> {
  // Stage 1: only needs personId (already known).
  const [{ data: ownershipRows }, { data: draftRows }] = await Promise.all([
    supabase.from("property_ownership").select("property_id").eq("person_id", personId),
    supabase.from("statements").select("id").eq("status", "draft"),
  ]);
  const rootPropertyIds = (ownershipRows ?? []).map((o) => o.property_id);
  const draftCount = draftRows?.length ?? 0;

  if (rootPropertyIds.length === 0) {
    return {
      tenancy: null,
      recentStatements: [],
      outstanding: null,
      mostOverdue: null,
      lastPayment: null,
      currentCycle: null,
      needsAttention: [],
      chart: null,
      draftCount,
    };
  }

  // Stage 2 (the "entity" fetch, like a page's initial gate): the active
  // tenancy under any of the admin's owned root properties.
  type PropertyRef = { name: string; address_line: string | null };
  type PersonRef = { given_name: string; family_name: string };
  // Ascending term_start: prefer the longest-running active tenancy as
  // "the" one this dashboard represents. This is a real, documented
  // limitation, not just a hedge — an owner letting a house by room (or
  // any owner with more than one simultaneously active tenancy) genuinely
  // has more than one "current" cycle, and picking any single one here is
  // arbitrary. A real fix (a tenancy switcher, aggregated widgets) is
  // Phase 5's "second property onboarding" scope; today's ROADMAP still
  // has the whole admin UI assuming one property/tenancy.
  const { data: tenancyRow } = await supabase
    .from("tenancies")
    .select("id, unit_id, term_end, due_day, properties(name, address_line), persons(given_name, family_name)")
    .in("property_id", rootPropertyIds)
    .eq("status", "active")
    .order("term_start", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!tenancyRow) {
    return {
      tenancy: null,
      recentStatements: [],
      outstanding: null,
      mostOverdue: null,
      lastPayment: null,
      currentCycle: null,
      needsAttention: [],
      chart: null,
      draftCount,
    };
  }

  const property = tenancyRow.properties as unknown as PropertyRef | PropertyRef[] | null;
  const propertyRef = Array.isArray(property) ? property[0] : property;
  const primaryTenant = tenancyRow.persons as unknown as PersonRef | PersonRef[] | null;
  const primaryTenantRef = Array.isArray(primaryTenant) ? primaryTenant[0] : primaryTenant;

  // Stage 3: everything that only needs `tenancyRow` — independent of
  // each other, run concurrently.
  const [
    { data: occupantRows },
    { data: contractRow },
    { data: meterRows },
    { data: recentStatementRows },
    { data: outstandingStatementRows },
    { data: openRequestRows },
    { data: inventoryFlagRows },
    chartData,
    { data: lastPaymentRow },
  ] = await Promise.all([
    supabase.from("tenancy_occupants").select("id").eq("tenancy_id", tenancyRow.id).is("move_out", null),
    supabase
      .from("contracts")
      .select("version, term_end, notice_days")
      .eq("tenancy_id", tenancyRow.id)
      .eq("status", "active")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("meters").select("id").eq("unit_id", tenancyRow.unit_id).is("removed_at", null),
    supabase
      .from("statements")
      .select("id, period_month, status, due_date, issued_at, total")
      .eq("tenancy_id", tenancyRow.id)
      .order("period_month", { ascending: false })
      .limit(6),
    supabase
      .from("statements")
      .select("id, period_month, status, due_date, issued_at, total")
      .eq("tenancy_id", tenancyRow.id)
      .in("status", ["issued", "partially_paid"]),
    supabase
      .from("requests")
      .select("id, category, title, description, change_payload, created_at")
      .eq("tenancy_id", tenancyRow.id)
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(10),
    supabase
      .from("inventory_items")
      .select("id, title, action_by_date, action_by_reason")
      .eq("unit_id", tenancyRow.unit_id)
      .eq("status", "active")
      .not("action_by_date", "is", null)
      .order("action_by_date", { ascending: true })
      .limit(5),
    getTenancyChartData(supabase, tenancyRow.id, 6, today),
    supabase.from("payments").select("amount, paid_at, method").eq("tenancy_id", tenancyRow.id).order("paid_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const meterIds = (meterRows ?? []).map((m) => m.id);
  const outstandingIds = (outstandingStatementRows ?? []).map((s) => s.id);
  const recentIds = (recentStatementRows ?? []).map((s) => s.id);
  const currentPeriod = viewMonth ?? recentStatementRows?.[0]?.period_month ?? `${today.slice(0, 7)}-01`;
  const { start: periodStart, end: periodEnd } = periodBounds(currentPeriod);

  // Stage 4: depends on stage-3 results (statement id lists, meter id
  // list, the derived current period).
  const [{ data: paymentRows }, { data: verifiedThisPeriod }] = await Promise.all([
    outstandingIds.length || recentIds.length
      ? supabase
          .from("payments")
          .select("statement_id, amount")
          .in("statement_id", [...new Set([...outstandingIds, ...recentIds])])
      : Promise.resolve({ data: [] }),
    meterIds.length
      ? supabase
          .from("meter_readings")
          .select("meter_id")
          .in("meter_id", meterIds)
          .eq("status", "verified")
          .gte("reading_date", periodStart)
          .lt("reading_date", periodEnd)
      : Promise.resolve({ data: [] }),
  ]);

  const paidByStatement = new Map<string, number>();
  for (const p of paymentRows ?? []) {
    paidByStatement.set(p.statement_id, (paidByStatement.get(p.statement_id) ?? 0) + p.amount);
  }

  function toDashboardStatement(row: { id: string; period_month: string; status: string; due_date: string | null; issued_at: string | null; total: number }): DashboardStatement {
    const status = row.status as StoredStatementStatus;
    return {
      id: row.id,
      periodMonth: row.period_month,
      status,
      dueDate: row.due_date,
      issuedAt: row.issued_at,
      total: row.total,
      paidSum: paidByStatement.get(row.id) ?? 0,
      overdue: isStatementOverdue({ status, dueDate: row.due_date, issuedAt: row.issued_at, today }),
    };
  }

  const recentStatements = (recentStatementRows ?? []).map(toDashboardStatement);
  const outstandingStatements = (outstandingStatementRows ?? []).map(toDashboardStatement);

  const totalRemaining = outstandingStatements.reduce((sum, s) => sum + Math.max(0, s.total - s.paidSum), 0);
  const earliestDueDate = outstandingStatements
    .map((s) => s.dueDate)
    .filter((d): d is string => d != null)
    .sort()[0] ?? null;
  const mostOverdue =
    outstandingStatements
      .filter((s) => s.overdue)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""))[0] ?? null;

  // recentStatements only holds the last 6 periods — browsing the month
  // picker further back than that won't find a match here and the
  // stepper's "Issued"/"Payment" steps fall back to "pending" rather than
  // reflecting a real (older) statement. Acceptable for now: the picker's
  // realistic use is "did last month's cycle complete", not a full
  // history browser (that's the statements list page's job).
  const currentCycleStatement = recentStatements.find((s) => s.periodMonth === currentPeriod) ?? null;

  const needsAttention: NeedsAttentionItem[] = [];
  for (const r of openRequestRows ?? []) {
    const isApproval = r.category === "personal_data_change" && r.change_payload != null;
    needsAttention.push({
      id: r.id,
      kind: isApproval ? "approval" : "request",
      // Deliberately the request's own already-localized title, not a
      // reconstructed before/after diff: change_payload.oldValue/newValue
      // can carry a NEVER_LOG_KEYS-class field, and that redaction rule
      // covers the audit trail, not an ad-hoc dashboard render.
      title: r.title,
      subtitle: r.category,
      date: r.created_at,
      href: isApproval ? `/requests/${r.id}` : `/requests/${r.id}`,
    });
  }
  for (const i of inventoryFlagRows ?? []) {
    needsAttention.push({
      id: i.id,
      kind: "inventory",
      title: i.title,
      subtitle: i.action_by_reason ?? "",
      date: i.action_by_date ?? today,
      href: `/properties/${tenancyRow.unit_id}`,
    });
  }
  needsAttention.sort((a, b) => a.date.localeCompare(b.date));

  return {
    tenancy: {
      id: tenancyRow.id,
      propertyName: propertyRef?.name ?? "—",
      addressLine: propertyRef?.address_line ?? null,
      primaryTenantName: primaryTenantRef ? `${primaryTenantRef.given_name} ${primaryTenantRef.family_name}` : "—",
      occupantCount: occupantRows?.length ?? 0,
      termEnd: tenancyRow.term_end,
      dueDay: tenancyRow.due_day,
      contract: contractRow ? { version: contractRow.version, termEnd: contractRow.term_end, noticeDays: contractRow.notice_days } : null,
    },
    recentStatements,
    outstanding: outstandingStatements.length > 0 ? { totalRemaining, count: outstandingStatements.length, earliestDueDate } : null,
    mostOverdue,
    lastPayment: lastPaymentRow ? { amount: lastPaymentRow.amount, paidAt: lastPaymentRow.paid_at, method: lastPaymentRow.method } : null,
    currentCycle: {
      periodMonth: currentPeriod,
      metersTotal: meterIds.length,
      metersVerified: new Set((verifiedThisPeriod ?? []).map((r) => r.meter_id)).size,
      statement: currentCycleStatement,
    },
    needsAttention: needsAttention.slice(0, 6),
    chart: chartData,
    draftCount,
  };
}
