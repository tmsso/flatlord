import Link from "next/link";
import { Camera, Clock } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { TenantAmountDue } from "@/components/tenant-amount-due";
import { getTenancyChartData } from "@/lib/billing/get-tenancy-chart-data";
import { ConsumptionMiniChart } from "@/components/consumption-mini-chart";
import { NewRequestDialog } from "@/components/requests/new-request-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NOTICE_TYPE_VARIANT } from "@/lib/notices/notice-type-variant";
import type { NoticeType } from "@/db/schema/notices";
import { resolveMeterReadingWindow } from "@/server/reminders/compute-lead-reminders";
import { TenantContractsList } from "@/components/tenant-contracts-list";
import { TenantDepositStatus } from "@/components/tenant-deposit-status";
import { TenantAttachmentsList } from "@/components/tenant-attachments-list";
import { TenantInventorySection } from "@/components/tenant-inventory-section";

export default async function TenantHomePage() {
  const tHome = await getTranslations("tenantProfile");
  const tAttachments = await getTranslations("attachments");
  const tHomeCta = await getTranslations("tenantHome");
  const tNotices = await getTranslations("notices");
  const format = await getFormatter();
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  // Stage 1: everything that only needs identity (profile.personId) —
  // none of these depend on each other, so they run concurrently instead
  // of one round-trip each (BACKLOG.md B-02).
  const [{ data: self }, { data: tenancy }, { data: personAttachmentRows }] = await Promise.all([
    supabase.from("persons").select("given_name").eq("id", profile.personId).maybeSingle(),
    supabase
      .from("tenancies")
      .select("id, unit_id, meter_reading_config, properties(name, address_line)")
      .eq("primary_tenant_id", profile.personId)
      .eq("status", "active")
      .maybeSingle(),
    // RLS (tenant_scope_attachments) already restricts these to the
    // caller's own person record — no extra filter here.
    supabase
      .from("attachments")
      .select("id, file_name, size_bytes, created_at, storage_path")
      .eq("entity_type", "person")
      .eq("entity_id", profile.personId)
      .order("created_at", { ascending: false }),
  ]);

  type PropertyRef = { name: string; address_line: string | null };
  type ChargeTypeRef = { code: string | null; unit: string | null };
  const today = new Date().toISOString().slice(0, 10);
  const readingWindow = resolveMeterReadingWindow(tenancy?.meter_reading_config, today);
  const property = tenancy?.properties as unknown as PropertyRef | PropertyRef[] | null;
  const addressLine = (Array.isArray(property) ? property[0] : property)?.address_line;

  // Stage 2: everything that only needs tenancy.id / tenancy.unit_id, once
  // known — again independent of each other, run concurrently.
  const [
    { data: statement },
    chartData,
    { data: contractRows },
    { data: depositRows },
    { data: tenancyAttachmentRows },
    { data: inventoryRows },
    { data: openCampaign },
    { data: noticeRows },
  ] = await Promise.all([
    // Outstanding = issued or partially_paid, most recent period first —
    // "overdue" is derived display state, not a separate stored value.
    tenancy
      ? supabase
          .from("statements")
          .select("id, period_month, status, due_date, issued_at, total")
          .eq("tenancy_id", tenancy.id)
          .in("status", ["issued", "partially_paid"])
          .order("period_month", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tenancy ? getTenancyChartData(supabase, tenancy.id, 6, new Date().toISOString().slice(0, 10)) : Promise.resolve(null),
    // RLS (tenant_scope_contracts) already restricts this to active/
    // superseded versions of the caller's own tenancy — no extra filter here.
    tenancy
      ? supabase
          .from("contracts")
          .select("id, version, status, term_start, term_end, document_path")
          .eq("tenancy_id", tenancy.id)
          .order("version", { ascending: false })
      : Promise.resolve({ data: [] }),
    // RLS (tenant_scope_deposit_transactions) already restricts this to the
    // caller's own tenancy — no extra filter here.
    tenancy
      ? supabase
          .from("deposit_transactions")
          .select("id, type, amount, currency, transaction_date, note")
          .eq("tenancy_id", tenancy.id)
          .order("transaction_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    // RLS (tenant_scope_attachments) already restricts these to the
    // caller's own tenancy — no extra filter here.
    tenancy
      ? supabase
          .from("attachments")
          .select("id, file_name, size_bytes, created_at, storage_path")
          .eq("entity_type", "tenancy")
          .eq("entity_id", tenancy.id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    // RLS (tenant_scope_inventory_items) already restricts these to the
    // active-tenancy's unit — no extra filter here.
    tenancy
      ? supabase
          .from("inventory_items")
          .select("id, title, owned_by, condition")
          .eq("unit_id", tenancy.unit_id)
          .eq("status", "active")
          .order("title")
      : Promise.resolve({ data: [] }),
    // .maybeSingle() errors (silently swallowed by the {data}-only
    // destructure here) if more than one row comes back — possible in
    // practice if the admin launches a second campaign before an earlier
    // one completes. .limit(1) forces the DB to only ever return one row,
    // so the ordering above deterministically wins instead of the query
    // failing and the whole reconfirmation section silently vanishing.
    tenancy
      ? supabase
          .from("inventory_reconfirmations")
          .select("id, due_date")
          .eq("tenancy_id", tenancy.id)
          .eq("status", "open")
          .order("initiated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    tenancy
      ? supabase
          .from("notices")
          .select("id, type, title, created_at")
          .eq("tenancy_id", tenancy.id)
          .order("created_at", { ascending: false })
          .limit(2)
      : Promise.resolve({ data: [] }),
  ]);

  const contractPaths = (contractRows ?? []).map((c) => c.document_path).filter((p): p is string => !!p);
  const allAttachmentPaths = [...(tenancyAttachmentRows ?? []), ...(personAttachmentRows ?? [])]
    .map((a) => a.storage_path)
    .filter((p): p is string => !!p);

  // Stage 3: depends on stage-2 results (statement id, campaign id, the
  // path lists just built above) — still independent of each other.
  const [
    { data: lineItemRows },
    { data: paymentRows },
    { data: contractSignedUrls },
    { data: attachmentSignedUrls },
    { data: campaignItemRows },
  ] = await Promise.all([
    // charge_types(code) join is for the D-07 (B-07) render-time label
    // resolution only — see the admin statement detail page's identical
    // comment.
    statement
      ? supabase
          .from("statement_line_items")
          .select("id, description, quantity, unit_rate, amount, is_billable, charge_schedule_id, meter_id, adjustment_id, sort_order, charge_types(code, unit)")
          .eq("statement_id", statement.id)
          .order("sort_order")
      : Promise.resolve({ data: [] }),
    statement ? supabase.from("payments").select("amount").eq("statement_id", statement.id) : Promise.resolve({ data: [] }),
    contractPaths.length ? supabase.storage.from("contracts").createSignedUrls(contractPaths, 600) : Promise.resolve({ data: [] }),
    allAttachmentPaths.length
      ? supabase.storage.from("attachments").createSignedUrls(allAttachmentPaths, 600)
      : Promise.resolve({ data: [] }),
    openCampaign
      ? supabase
          .from("inventory_reconfirmation_items")
          .select("id, inventory_item_id, status, inventory_items(title)")
          .eq("reconfirmation_id", openCampaign.id)
      : Promise.resolve({ data: [] }),
  ]);

  const contractUrlByPath = new Map((contractSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));
  const attachmentUrlByPath = new Map((attachmentSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

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
    <div className="flex flex-col gap-4">
      {self && (
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-semibold text-primary-foreground" aria-hidden="true">
            {self.given_name.charAt(0)}
          </span>
          <div>
            <h1 className="text-base font-semibold">{tHome("greeting", { name: self.given_name })}</h1>
            {addressLine && <p className="text-xs text-muted-foreground">{addressLine}</p>}
          </div>
        </div>
      )}
      <TenantAmountDue
        statement={
          statement
            ? {
                id: statement.id,
                periodMonth: statement.period_month,
                status: statement.status,
                dueDate: statement.due_date,
                issuedAt: statement.issued_at,
                total: statement.total,
              }
            : null
        }
        paidSum={(paymentRows ?? []).reduce((sum, p) => sum + p.amount, 0)}
        lineItems={(lineItemRows ?? []).map((li) => {
          const chargeType = li.charge_types as unknown as ChargeTypeRef | ChargeTypeRef[] | null;
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
            unit: chargeTypeRef?.unit ?? null,
          };
        })}
        today={new Date().toISOString().slice(0, 10)}
      />
      {tenancy && (
        <div className="flex flex-col gap-2">
          {/* One primary action per screen (design/02): readings. */}
          <Link href="/home/meters" className={cn(buttonVariants(), "h-[52px] w-full gap-2 text-base")}>
            <Camera className="size-5" aria-hidden="true" />
            {tHomeCta("submitReadings")}
          </Link>
          <p className="flex items-center justify-center gap-1.5 text-xs text-warning">
            <Clock className="size-3.5" aria-hidden="true" />
            {tHomeCta("readingWindow", {
              range: format.dateTimeRange(new Date(`${readingWindow.start}T00:00:00Z`), new Date(`${readingWindow.end}T00:00:00Z`), {
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              }),
            })}
          </p>
          <NewRequestDialog trigger="cta" />
        </div>
      )}
      <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">{tHomeCta("noticesTitle")}</h2>
          <Link href="/home/notices" className="text-sm text-primary hover:underline">
            {tHomeCta("seeAll")}
          </Link>
        </div>
        {(noticeRows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">{tHomeCta("noNotices")}</p>
        ) : (
          <ul className="flex flex-col">
            {(noticeRows ?? []).map((n, i) => (
              <li key={n.id} className={i > 0 ? "border-t border-border" : ""}>
                <Link href={`/home/notices/${n.id}`} className="flex min-h-11 items-start gap-3 py-2.5 hover:bg-muted/50">
                  <Badge variant={NOTICE_TYPE_VARIANT[n.type as NoticeType]} className="mt-0.5 shrink-0">
                    {tNotices(`type_${n.type}`)}
                  </Badge>
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm">{n.title}</span>
                    <span className="text-xs text-muted-foreground tabular-figures">{format.dateTime(new Date(n.created_at), { dateStyle: "medium" })}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      {chartData && chartData.consumptionSeries.length > 0 && (
        <ConsumptionMiniChart
          months={chartData.consumption}
          chargeTypeId={chartData.consumptionSeries[0].chargeTypeId}
          label={chartData.consumptionSeries[0].label}
          unit={chartData.consumptionSeries[0].unit}
        />
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
