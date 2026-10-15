import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { TenancyDetail } from "@/components/tenancy-detail";
import { getTenancyChartData } from "@/lib/billing/get-tenancy-chart-data";
import { MeterConsumptionChart } from "@/components/meter-consumption-chart";
import { MonthlyCostChart } from "@/components/monthly-cost-chart";
import { getTenancyAnalytics } from "@/lib/analytics/get-tenancy-analytics";
import { CumulativeLedgerChart } from "@/components/analytics/cumulative-ledger-chart";
import { TenancyTimeline } from "@/components/analytics/tenancy-timeline";
import { TenancyRates } from "@/components/billing-setup/tenancy-rates";
import type { ChargeTypeRow } from "@/components/billing-setup/unit-billing-setup";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getOwnerModules } from "@/server/modules/get-modules";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { ContractsSection } from "@/components/contracts-section";
import { DepositSection } from "@/components/deposit-section";
import { AttachmentsSection } from "@/components/attachments-section";
import { DeclarationGenerator } from "@/components/declaration-generator";

type PersonRef = { given_name: string; family_name: string };
type PropertyRef = { name: string };

export default async function TenancyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("tenancies");
  const supabase = await createClient();

  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select(
      "id, unit_id, primary_tenant_id, primary_tenant_registration_type, term_start, term_end, notice_days, due_day, status, properties(name), persons(given_name, family_name)",
    )
    .eq("id", id)
    .maybeSingle();
  assertNoQueryError("tenancies/[id]", tenancyError);
  if (!tenancy) notFound();

  const property = tenancy.properties as unknown as PropertyRef | PropertyRef[] | null;
  const propertyName = (Array.isArray(property) ? property[0] : property)?.name ?? "—";
  const primaryTenant = tenancy.persons as unknown as PersonRef | PersonRef[] | null;
  const primaryTenantName = (() => {
    const p = Array.isArray(primaryTenant) ? primaryTenant[0] : primaryTenant;
    return p ? `${p.given_name} ${p.family_name}` : "—";
  })();

  // Stage 1: everything that only needs `id` (already known) — independent
  // of each other, run concurrently (BACKLOG.md B-02).
  const [{ data: occupantRows }, { data: persons }, { data: contractRows }, { data: depositRows }, { data: attachmentRows }, chartData, analytics] =
    await Promise.all([
      supabase
        .from("tenancy_occupants")
        .select("id, person_id, relationship, registration_type, move_in, move_out, persons(given_name, family_name)")
        .eq("tenancy_id", id)
        .order("move_in"),
      supabase.from("persons").select("id, given_name, family_name").order("family_name"),
      supabase
        .from("contracts")
        .select("id, version, status, term_start, term_end, notice_days, deposit_amount, deposit_currency, signed_at, document_path")
        .eq("tenancy_id", id)
        .order("version", { ascending: false }),
      supabase
        .from("deposit_transactions")
        .select("id, type, amount, currency, transaction_date, note")
        .eq("tenancy_id", id)
        .order("transaction_date", { ascending: true }),
      supabase
        .from("attachments")
        .select("id, file_name, size_bytes, note, created_at, storage_path")
        .eq("entity_type", "tenancy")
        .eq("entity_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      getTenancyChartData(supabase, id, 12, new Date().toISOString().slice(0, 10)),
      // Phase 4b admin analytics — admin-shell only. getTenancyAnalytics /
      // CumulativeLedgerChart must never be imported under src/app/(tenant):
      // the cumulative ledger is the running total-paid-to-date IDEAS.md
      // forbids showing the tenant.
      getTenancyAnalytics(supabase, id),
    ]);

  const { consumption, cost, consumptionSeries, meteredSeries } = chartData;

  // Rates (charge_schedules) for this tenancy against its unit's catalog.
  const [
    { data: chargeTypeRows, error: chargeTypesError },
    { data: scheduleRows, error: schedulesError },
    { data: lastBilled, error: lastBilledError },
  ] = await Promise.all([
    supabase.from("charge_types").select("id, code, name, kind, unit, active").eq("unit_id", tenancy.unit_id).order("sort_order"),
    supabase.from("charge_schedules").select("id, charge_type_id, amount, rate_per_unit, valid_from, valid_to").eq("tenancy_id", id),
    supabase
      .from("statements")
      .select("period_month")
      .eq("tenancy_id", id)
      .neq("status", "draft")
      .is("voided_at", null)
      .order("period_month", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  assertNoQueryError("tenancies/[id]/charge_types", chargeTypesError);
  assertNoQueryError("tenancies/[id]/charge_schedules", schedulesError);
  assertNoQueryError("tenancies/[id]/last_billed", lastBilledError);
  // B-48: requests module off → no request events in the owner UI (D-33).
  const requestsOn = (await getOwnerModules(supabase, (await getCurrentProfile(supabase)).userId)).has("requests");

  const contractPaths = (contractRows ?? []).map((c) => c.document_path).filter((p): p is string => !!p);
  const attachmentPaths = (attachmentRows ?? []).map((a) => a.storage_path).filter((p): p is string => !!p);

  // Stage 2: depends on stage-1 results (the path lists just built above).
  const [{ data: contractSignedUrls }, { data: attachmentSignedUrls }] = await Promise.all([
    contractPaths.length ? supabase.storage.from("contracts").createSignedUrls(contractPaths, 600) : Promise.resolve({ data: [] }),
    attachmentPaths.length ? supabase.storage.from("attachments").createSignedUrls(attachmentPaths, 600) : Promise.resolve({ data: [] }),
  ]);
  const contractUrlByPath = new Map((contractSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));
  const attachmentUrlByPath = new Map((attachmentSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-muted-foreground">{t("title")}</div>
      <TenancyDetail
        tenancy={{
          id: tenancy.id,
          propertyName,
          primaryTenantName,
          primaryTenantRegistrationType: tenancy.primary_tenant_registration_type,
          termStart: tenancy.term_start,
          termEnd: tenancy.term_end,
          noticeDays: tenancy.notice_days,
          dueDay: tenancy.due_day,
          status: tenancy.status,
        }}
        occupants={(occupantRows ?? []).map((o) => {
          const person = o.persons as unknown as PersonRef | PersonRef[] | null;
          const p = Array.isArray(person) ? person[0] : person;
          return {
            id: o.id,
            personId: o.person_id,
            personName: p ? `${p.given_name} ${p.family_name}` : "—",
            relationship: o.relationship,
            registrationType: o.registration_type,
            moveIn: o.move_in,
            moveOut: o.move_out,
          };
        })}
        persons={(persons ?? []).map((p) => ({ id: p.id, name: `${p.given_name} ${p.family_name}` }))}
      />
      <TenancyRates
        tenancyId={id}
        unitId={tenancy.unit_id}
        chargeTypes={(chargeTypeRows ?? []).map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          kind: c.kind as ChargeTypeRow["kind"],
          unit: c.unit,
          active: c.active,
        }))}
        schedules={(scheduleRows ?? []).map((r) => ({
          id: r.id,
          chargeTypeId: r.charge_type_id,
          amount: r.amount == null ? null : Number(r.amount),
          ratePerUnit: r.rate_per_unit == null ? null : Number(r.rate_per_unit),
          validFrom: r.valid_from,
          validTo: r.valid_to,
        }))}
        lastBilledPeriod={lastBilled?.period_month ?? null}
        termStart={tenancy.term_start}
        today={new Date().toISOString().slice(0, 10)}
      />
      <ContractsSection
        tenancyId={id}
        contracts={(contractRows ?? []).map((c) => ({
          id: c.id,
          version: c.version,
          status: c.status as "draft" | "active" | "superseded",
          termStart: c.term_start,
          termEnd: c.term_end,
          noticeDays: c.notice_days,
          depositAmount: c.deposit_amount,
          depositCurrency: c.deposit_currency,
          signedAt: c.signed_at,
          documentUrl: c.document_path ? (contractUrlByPath.get(c.document_path) ?? null) : null,
        }))}
      />
      <DepositSection
        tenancyId={id}
        transactions={(depositRows ?? []).map((d) => ({
          id: d.id,
          type: d.type as "paid" | "applied" | "retained" | "refunded",
          amount: d.amount,
          currency: d.currency,
          transactionDate: d.transaction_date,
          note: d.note,
        }))}
      />
      <AttachmentsSection
        entityType="tenancy"
        entityId={id}
        attachments={(attachmentRows ?? []).map((a) => ({
          id: a.id,
          fileName: a.file_name,
          sizeBytes: a.size_bytes,
          note: a.note,
          createdAt: a.created_at,
          downloadUrl: a.storage_path ? (attachmentUrlByPath.get(a.storage_path) ?? null) : null,
        }))}
      />
      <DeclarationGenerator
        tenancyId={id}
        occupants={[
          { personId: tenancy.primary_tenant_id, name: primaryTenantName },
          ...(occupantRows ?? []).map((o) => {
            const person = o.persons as unknown as PersonRef | PersonRef[] | null;
            const p = Array.isArray(person) ? person[0] : person;
            return { personId: o.person_id, name: p ? `${p.given_name} ${p.family_name}` : "—" };
          }),
        ]}
      />
      {consumptionSeries.length > 0 && <MeterConsumptionChart months={consumption} series={consumptionSeries} />}
      <MonthlyCostChart months={cost} meteredSeries={meteredSeries} />
      <CumulativeLedgerChart points={analytics.ledger} />
      <TenancyTimeline
        events={requestsOn ? analytics.timeline : analytics.timeline.filter((e) => e.type !== "request_opened")}
      />
    </div>
  );
}
