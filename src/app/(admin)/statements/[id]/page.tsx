import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StatementDetail } from "@/components/statement-detail";
import { resolveAmountDueContext } from "@/server/notifications/resolve-amount-due-context";
import { assertNoQueryError } from "@/lib/supabase/require-row";

export default async function AdminStatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("statements");
  const supabase = await createClient();

  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("id, tenancy_id, period_month, status, due_date, total, issued_at, created_at")
    .eq("id", id)
    .maybeSingle();
  assertNoQueryError("statements/[id]", statementError);
  if (!statement) notFound();

  // charge_types(code) join is for the D-07 (B-07) render-time label
  // resolution only — issued line items are immutable, so historical
  // rows' raw `description` never gets edited, just displayed
  // differently when the charge type has a standard catalog code.
  const { data: lineItemRows } = await supabase
    .from("statement_line_items")
    .select("id, description, quantity, unit_rate, amount, is_billable, charge_schedule_id, meter_id, adjustment_id, sort_order, charge_types(code)")
    .eq("statement_id", id)
    .order("sort_order");

  const { data: paymentRows } = await supabase
    .from("payments")
    .select("id, amount, paid_at, method, note")
    .eq("statement_id", id)
    .order("paid_at");

  // wa.me link is built server-side (plain href, no client logic needed).
  // Only issued/partially_paid statements can have anything outstanding —
  // a paid statement has nothing left to send, and draft has no due date
  // yet. resolveAmountDueContext returns null (not a throw) if it turns
  // out nothing actually remains (e.g. a tracked-only month), so this
  // stays a plain render, never a 500.
  let waLink: string | null = null;
  let canSendEmail = false;
  if (statement.status === "issued" || statement.status === "partially_paid") {
    const context = await resolveAmountDueContext(supabase, id);
    if (context) {
      canSendEmail = Boolean(context.tenantEmail);
      if (context.tenantPhone) {
        const digits = context.tenantPhone.replace(/[^\d]/g, "");
        waLink = `https://wa.me/${digits}?text=${encodeURIComponent(context.body)}`;
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="text-xs text-muted-foreground">
        <span>{t("title")}</span>
      </div>
      <StatementDetail
        statement={{
          id: statement.id,
          periodMonth: statement.period_month,
          status: statement.status,
          dueDate: statement.due_date,
          total: statement.total,
          issuedAt: statement.issued_at,
          createdAt: statement.created_at,
        }}
        lineItems={(lineItemRows ?? []).map((li) => {
          const chargeType = li.charge_types as unknown as { code: string | null } | { code: string | null }[] | null;
          const chargeTypeRef = Array.isArray(chargeType) ? chargeType[0] : chargeType;
          return {
            id: li.id,
            description: li.description,
            quantity: li.quantity == null ? null : Number(li.quantity),
            unitRate: li.unit_rate == null ? null : Number(li.unit_rate),
            amount: li.amount,
            isBillable: li.is_billable,
            chargeScheduleId: li.charge_schedule_id,
            meterId: li.meter_id,
            adjustmentId: li.adjustment_id,
            chargeTypeCode: chargeTypeRef?.code ?? null,
          };
        })}
        payments={(paymentRows ?? []).map((p) => ({
          id: p.id,
          amount: p.amount,
          paidAt: p.paid_at,
          method: p.method,
          note: p.note,
        }))}
        today={new Date().toISOString().slice(0, 10)}
        waLink={waLink}
        canSendEmail={canSendEmail}
      />
    </div>
  );
}
