import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatementDetail } from "@/components/statement-detail";
import { resolveAmountDueContext } from "@/server/notifications/resolve-amount-due-context";
import { assertNoQueryError } from "@/lib/supabase/require-row";

export default async function AdminStatementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("id, tenancy_id, period_month, status, due_date, total, issued_at, created_at")
    .eq("id", id)
    .maybeSingle();
  assertNoQueryError("statements/[id]", statementError);
  if (!statement) notFound();

  // charge_types(code) join is for the D-07 (B-07) render-time label
  // resolution — issued line items are immutable, so historical rows' raw
  // `description` never gets edited, just displayed differently when the
  // charge type has a standard catalog code. unit, the schedule's
  // valid_from and the from/to readings feed design/05's detail line
  // ("12 118 → 12 316 = 198 kWh × 72 Ft/kWh").
  const [{ data: lineItemRows }, { data: paymentRows }, { data: deliveryRows, error: deliveriesError }] = await Promise.all([
    supabase
      .from("statement_line_items")
      .select(
        "id, description, quantity, unit_rate, amount, is_billable, charge_schedule_id, meter_id, adjustment_id, sort_order, charge_types(code, unit), charge_schedules(valid_from), meters(base_value), from_reading:meter_readings!from_reading_id(confirmed_value, entered_value), to_reading:meter_readings!to_reading_id(confirmed_value, entered_value)",
      )
      .eq("statement_id", id)
      .order("sort_order"),
    supabase.from("payments").select("id, amount, paid_at, method, note, created_at").eq("statement_id", id).order("paid_at"),
    supabase
      .from("statement_deliveries")
      .select("id, channel, kind, status, created_by, created_at")
      .eq("statement_id", id)
      .order("created_at", { ascending: false }),
  ]);
  // Fails open: the delivery log is secondary, and the table may not exist
  // yet if this code deploys before migration 0028 reaches the database.
  if (deliveriesError) console.error("[statements/[id]] delivery log query failed:", deliveriesError.message);

  type Joined<T> = T | T[] | null;
  const one = <T,>(v: Joined<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  type ReadingRef = { confirmed_value: string | null; entered_value: string | null };
  const readingValue = (r: ReadingRef | null) => {
    const v = r?.confirmed_value ?? r?.entered_value;
    return v == null ? null : Number(v);
  };
  const baseValue = (m: { base_value: string | null } | null) => (m?.base_value == null ? null : Number(m.base_value));

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
        const chargeType = one(li.charge_types as unknown as Joined<{ code: string | null; unit: string | null }>);
        const schedule = one(li.charge_schedules as unknown as Joined<{ valid_from: string }>);
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
          chargeTypeCode: chargeType?.code ?? null,
          unit: chargeType?.unit ?? null,
          validFrom: schedule?.valid_from ?? null,
          // No from-reading means the delta started at the meter's base
          // value (first period after install/replacement) — same anchor
          // compute-statement.ts uses.
          fromValue:
            readingValue(one(li.from_reading as unknown as Joined<ReadingRef>)) ??
            baseValue(one(li.meters as unknown as Joined<{ base_value: string | null }>)),
          toValue: readingValue(one(li.to_reading as unknown as Joined<ReadingRef>)),
        };
      })}
      payments={(paymentRows ?? []).map((p) => ({
        id: p.id,
        amount: p.amount,
        paidAt: p.paid_at,
        method: p.method,
        note: p.note,
        createdAt: p.created_at,
      }))}
      deliveries={(deliveryRows ?? []).map((d) => ({
        id: d.id,
        channel: d.channel,
        kind: d.kind,
        status: d.status,
        createdAt: d.created_at,
        automatic: d.created_by == null,
      }))}
      today={new Date().toISOString().slice(0, 10)}
      waLink={waLink}
      canSendEmail={canSendEmail}
    />
  );
}
