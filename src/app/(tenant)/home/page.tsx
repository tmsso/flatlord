import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { TenantAmountDue } from "@/components/tenant-amount-due";
import { getTenancyChartData } from "@/lib/billing/get-tenancy-chart-data";
import { MeterConsumptionChart } from "@/components/meter-consumption-chart";
import { TenantContractsList } from "@/components/tenant-contracts-list";
import { TenantDepositStatus } from "@/components/tenant-deposit-status";

export default async function TenantHomePage() {
  const t = await getTranslations("statements");
  const tHome = await getTranslations("tenantProfile");
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: self } = await supabase.from("persons").select("given_name").eq("id", profile.personId).maybeSingle();

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id, properties(name, address_line)")
    .eq("primary_tenant_id", profile.personId)
    .eq("status", "active")
    .maybeSingle();

  type PropertyRef = { name: string; address_line: string | null };
  const property = tenancy?.properties as unknown as PropertyRef | PropertyRef[] | null;
  const addressLine = (Array.isArray(property) ? property[0] : property)?.address_line;

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

  const chartData = tenancy ? await getTenancyChartData(supabase, tenancy.id, 6, new Date().toISOString().slice(0, 10)) : null;

  // RLS (tenant_scope_contracts) already restricts this to active/
  // superseded versions of the caller's own tenancy — no extra filter here.
  const { data: contractRows } = tenancy
    ? await supabase
        .from("contracts")
        .select("id, version, status, term_start, term_end, document_path")
        .eq("tenancy_id", tenancy.id)
        .order("version", { ascending: false })
    : { data: [] };
  const contractPaths = (contractRows ?? []).map((c) => c.document_path).filter((p): p is string => !!p);
  const { data: contractSignedUrls } = contractPaths.length
    ? await supabase.storage.from("contracts").createSignedUrls(contractPaths, 600)
    : { data: [] };
  const contractUrlByPath = new Map((contractSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  // RLS (tenant_scope_deposit_transactions) already restricts this to the
  // caller's own tenancy — no extra filter here.
  const { data: depositRows } = tenancy
    ? await supabase
        .from("deposit_transactions")
        .select("id, type, amount, currency, transaction_date, note")
        .eq("tenancy_id", tenancy.id)
        .order("transaction_date", { ascending: true })
    : { data: [] };

  return (
    <div className="flex flex-col gap-6">
      {self && (
        <div>
          <p className="text-base font-semibold">{tHome("greeting", { name: self.given_name })}</p>
          {addressLine && <p className="text-sm text-muted-foreground">{addressLine}</p>}
        </div>
      )}
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
      {chartData && chartData.consumptionSeries.length > 0 && (
        <MeterConsumptionChart months={chartData.consumption} series={chartData.consumptionSeries} />
      )}
      <TenantContractsList
        contracts={(contractRows ?? []).map((c) => ({
          id: c.id,
          version: c.version,
          status: c.status as "active" | "superseded",
          termStart: c.term_start,
          termEnd: c.term_end,
          documentUrl: c.document_path ? (contractUrlByPath.get(c.document_path) ?? null) : null,
        }))}
      />
      <TenantDepositStatus
        transactions={(depositRows ?? []).map((d) => ({
          id: d.id,
          type: d.type as "paid" | "applied" | "retained" | "refunded",
          amount: d.amount,
          currency: d.currency,
          transactionDate: d.transaction_date,
          note: d.note,
        }))}
      />
    </div>
  );
}
