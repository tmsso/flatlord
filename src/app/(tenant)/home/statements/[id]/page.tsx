import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { TenantStatementDetail } from "@/components/tenant-statement-detail";

export default async function TenantStatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("statements");
  const supabase = await createClient();

  // RLS scopes this to the caller's own tenancy — a statement belonging
  // to a different tenancy simply returns no row (null), not an error;
  // notFound() renders Next's 404 rather than throwing.
  const { data: statement } = await supabase
    .from("statements")
    .select("id, period_month, status, due_date, total, issued_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!statement) notFound();

  const { data: lineItemRows } = await supabase
    .from("statement_line_items")
    .select("id, description, quantity, unit_rate, amount, is_billable, charge_schedule_id, meter_id, adjustment_id, sort_order")
    .eq("statement_id", id)
    .order("sort_order");

  const { data: paymentRows } = await supabase
    .from("payments")
    .select("id, amount, paid_at, method")
    .eq("statement_id", id)
    .order("paid_at");

  return (
    <div className="flex flex-col gap-6">
      <div className="text-xs text-muted-foreground">{t("title")}</div>
      <TenantStatementDetail
        statement={{
          id: statement.id,
          periodMonth: statement.period_month,
          status: statement.status,
          dueDate: statement.due_date,
          total: statement.total,
        }}
        lineItems={(lineItemRows ?? []).map((li) => ({
          id: li.id,
          description: li.description,
          quantity: li.quantity == null ? null : Number(li.quantity),
          unitRate: li.unit_rate == null ? null : Number(li.unit_rate),
          amount: li.amount,
          isBillable: li.is_billable,
          chargeScheduleId: li.charge_schedule_id,
          meterId: li.meter_id,
          adjustmentId: li.adjustment_id,
        }))}
        payments={(paymentRows ?? []).map((p) => ({ id: p.id, amount: p.amount, paidAt: p.paid_at, method: p.method }))}
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
