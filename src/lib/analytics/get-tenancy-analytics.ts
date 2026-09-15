import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import {
  computeCumulativeLedger,
  monthsRange,
  type CumulativeLedgerPoint,
} from "@/lib/analytics/compute-cumulative-ledger";
import { buildTenancyTimeline, type TimelineEvent } from "@/lib/analytics/build-tenancy-timeline";

// Server loader for the Phase 4b admin analytics section on the admin
// tenancy detail page. ADMIN-ONLY: this must never be imported from
// anything under src/app/(tenant) — the cumulative ledger is exactly the
// "total-paid-to-date" figure IDEAS.md forbids showing the tenant.
export interface TenancyAnalytics {
  ledger: CumulativeLedgerPoint[];
  timeline: TimelineEvent[];
}

export async function getTenancyAnalytics(
  supabase: SupabaseClient,
  tenancyId: string,
): Promise<TenancyAnalytics> {
  const { data: statementRows, error: statementsError } = await supabase
    .from("statements")
    .select("id, period_month, status, total, issued_at")
    .eq("tenancy_id", tenancyId)
    .neq("status", "draft");
  assertNoQueryError("analytics/statements", statementsError);

  const { data: paymentRows, error: paymentsError } = await supabase
    .from("payments")
    .select("id, amount, paid_at, method")
    .eq("tenancy_id", tenancyId);
  assertNoQueryError("analytics/payments", paymentsError);

  const { data: requestRows, error: requestsError } = await supabase
    .from("requests")
    .select("id, title, category, status, created_at")
    .eq("tenancy_id", tenancyId);
  assertNoQueryError("analytics/requests", requestsError);

  const { data: noticeRows, error: noticesError } = await supabase
    .from("notices")
    .select("id, title, type, created_at")
    .eq("tenancy_id", tenancyId);
  assertNoQueryError("analytics/notices", noticesError);

  const issuedStatements = (statementRows ?? []).filter(
    (s): s is typeof s & { issued_at: string } => s.issued_at != null,
  );

  // Ledger month span: earliest activity → current month. No activity at
  // all → empty ledger, the component renders its empty state.
  const anchors = [
    ...issuedStatements.map((s) => s.issued_at.slice(0, 7)),
    ...(paymentRows ?? []).map((p) => (p.paid_at as string).slice(0, 7)),
  ].sort();
  const ledger = anchors.length
    ? computeCumulativeLedger({
        statements: issuedStatements.map((s) => ({ issuedAt: s.issued_at, total: s.total })),
        payments: (paymentRows ?? []).map((p) => ({ paidAt: p.paid_at as string, amount: p.amount })),
        months: monthsRange(`${anchors[0]}-01`, new Date().toISOString().slice(0, 10)),
      })
    : [];

  const timeline = buildTenancyTimeline({
    statements: (statementRows ?? []).map((s) => ({
      id: s.id,
      periodMonth: s.period_month,
      issuedAt: s.issued_at,
      total: s.total,
    })),
    payments: (paymentRows ?? []).map((p) => ({
      id: p.id,
      paidAt: p.paid_at as string,
      amount: p.amount,
      method: p.method as string,
    })),
    requests: (requestRows ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category as string,
      status: r.status as string,
      createdAt: r.created_at as string,
    })),
    notices: (noticeRows ?? []).map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type as string,
      createdAt: n.created_at as string,
    })),
  });

  return { ledger, timeline };
}
