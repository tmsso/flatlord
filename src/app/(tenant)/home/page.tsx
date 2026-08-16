import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { TenantAmountDue } from "@/components/tenant-amount-due";
import { getTenancyChartData } from "@/lib/billing/get-tenancy-chart-data";
import { MeterConsumptionChart } from "@/components/meter-consumption-chart";
import { TenantContractsList } from "@/components/tenant-contracts-list";
import { TenantDepositStatus } from "@/components/tenant-deposit-status";
import { TenantAttachmentsList } from "@/components/tenant-attachments-list";
import { TenantInventorySection } from "@/components/tenant-inventory-section";

export default async function TenantHomePage() {
  const t = await getTranslations("statements");
  const tHome = await getTranslations("tenantProfile");
  const tAttachments = await getTranslations("attachments");
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: self } = await supabase.from("persons").select("given_name").eq("id", profile.personId).maybeSingle();

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id, unit_id, properties(name, address_line)")
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

  // RLS (tenant_scope_attachments) already restricts these to the
  // caller's own tenancy / own person record — no extra filter here.
  const { data: tenancyAttachmentRows } = tenancy
    ? await supabase
        .from("attachments")
        .select("id, file_name, size_bytes, created_at, storage_path")
        .eq("entity_type", "tenancy")
        .eq("entity_id", tenancy.id)
        .order("created_at", { ascending: false })
    : { data: [] };
  const { data: personAttachmentRows } = await supabase
    .from("attachments")
    .select("id, file_name, size_bytes, created_at, storage_path")
    .eq("entity_type", "person")
    .eq("entity_id", profile.personId)
    .order("created_at", { ascending: false });

  const allAttachmentPaths = [...(tenancyAttachmentRows ?? []), ...(personAttachmentRows ?? [])]
    .map((a) => a.storage_path)
    .filter((p): p is string => !!p);
  const { data: attachmentSignedUrls } = allAttachmentPaths.length
    ? await supabase.storage.from("attachments").createSignedUrls(allAttachmentPaths, 600)
    : { data: [] };
  const attachmentUrlByPath = new Map((attachmentSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  // RLS (tenant_scope_inventory_items) already restricts these to the
  // active-tenancy's unit — no extra filter here.
  const { data: inventoryRows } = tenancy
    ? await supabase
        .from("inventory_items")
        .select("id, title, owned_by, condition")
        .eq("unit_id", tenancy.unit_id)
        .eq("status", "active")
        .order("title")
    : { data: [] };

  // .maybeSingle() errors (silently swallowed by the {data}-only
  // destructure here) if more than one row comes back — possible in
  // practice if the admin launches a second campaign before an earlier
  // one completes. .limit(1) forces the DB to only ever return one row,
  // so the ordering above deterministically wins instead of the query
  // failing and the whole reconfirmation section silently vanishing.
  const { data: openCampaign } = tenancy
    ? await supabase
        .from("inventory_reconfirmations")
        .select("id, due_date")
        .eq("tenancy_id", tenancy.id)
        .eq("status", "open")
        .order("initiated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const { data: campaignItemRows } = openCampaign
    ? await supabase
        .from("inventory_reconfirmation_items")
        .select("id, inventory_item_id, status, inventory_items(title)")
        .eq("reconfirmation_id", openCampaign.id)
    : { data: [] };

  type InventoryItemTitleRef = { title: string };
  const activeCampaign = openCampaign
    ? {
        id: openCampaign.id,
        dueDate: openCampaign.due_date,
        items: (campaignItemRows ?? []).map((ci) => {
          const ref = ci.inventory_items as unknown as InventoryItemTitleRef | InventoryItemTitleRef[] | null;
          const invItem = Array.isArray(ref) ? ref[0] : ref;
          return {
            id: ci.id,
            inventoryItemId: ci.inventory_item_id,
            itemTitle: invItem?.title ?? "—",
            status: ci.status as "pending" | "confirmed" | "discrepancy",
          };
        }),
      }
    : null;

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
      <TenantAttachmentsList
        title={tAttachments("tenancyTitle")}
        attachments={(tenancyAttachmentRows ?? []).map((a) => ({
          id: a.id,
          fileName: a.file_name,
          sizeBytes: a.size_bytes,
          createdAt: a.created_at,
          downloadUrl: a.storage_path ? (attachmentUrlByPath.get(a.storage_path) ?? null) : null,
        }))}
      />
      <TenantAttachmentsList
        title={tAttachments("personTitle")}
        attachments={(personAttachmentRows ?? []).map((a) => ({
          id: a.id,
          fileName: a.file_name,
          sizeBytes: a.size_bytes,
          createdAt: a.created_at,
          downloadUrl: a.storage_path ? (attachmentUrlByPath.get(a.storage_path) ?? null) : null,
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
      <TenantInventorySection
        items={(inventoryRows ?? []).map((i) => ({
          id: i.id,
          title: i.title,
          ownedBy: i.owned_by as "owner" | "renter" | "conditional",
          condition: i.condition,
        }))}
        activeCampaign={activeCampaign}
      />
    </div>
  );
}
