import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { TenantAmountDue } from "@/components/tenant-amount-due";

export default async function TenantHomePage() {
  const t = await getTranslations("statements");
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id")
    .eq("primary_tenant_id", profile.personId)
    .eq("status", "active")
    .maybeSingle();

  // Outstanding = issued or partially_paid, most recent period first —
  // "overdue" is derived display state, not a separate stored value.
  const { data: statement } = tenancy
    ? await supabase
        .from("statements")
        .select("id, period_month, status, due_date, total")
        .eq("tenancy_id", tenancy.id)
        .in("status", ["issued", "partially_paid"])
        .order("period_month", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: lineItemRows } = statement
    ? await supabase
        .from("statement_line_items")
        .select("id, description, quantity, unit_rate, amount, is_billable, charge_schedule_id, meter_id, adjustment_id, sort_order")
        .eq("statement_id", statement.id)
        .order("sort_order")
    : { data: [] };

  const { data: paymentRows } = statement
    ? await supabase.from("payments").select("amount").eq("statement_id", statement.id)
    : { data: [] };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{t("amountDue")}</h1>
      <TenantAmountDue
        statement={
          statement
            ? {
                id: statement.id,
                periodMonth: statement.period_month,
                status: statement.status,
                dueDate: statement.due_date,
                total: statement.total,
              }
            : null
        }
        paidSum={(paymentRows ?? []).reduce((sum, p) => sum + p.amount, 0)}
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
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
