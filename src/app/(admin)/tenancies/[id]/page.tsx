import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { TenancyDetail } from "@/components/tenancy-detail";
import { getTenancyChartData } from "@/lib/billing/get-tenancy-chart-data";
import { MeterConsumptionChart } from "@/components/meter-consumption-chart";
import { MonthlyCostChart } from "@/components/monthly-cost-chart";
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

  const { data: occupantRows } = await supabase
    .from("tenancy_occupants")
    .select("id, person_id, relationship, registration_type, move_in, move_out, persons(given_name, family_name)")
    .eq("tenancy_id", id)
    .order("move_in");

  const { data: persons } = await supabase.from("persons").select("id, given_name, family_name").order("family_name");

  const { data: contractRows } = await supabase
    .from("contracts")
    .select("id, version, status, term_start, term_end, notice_days, deposit_amount, deposit_currency, signed_at, document_path")
    .eq("tenancy_id", id)
    .order("version", { ascending: false });

  const contractPaths = (contractRows ?? []).map((c) => c.document_path).filter((p): p is string => !!p);
  const { data: contractSignedUrls } = contractPaths.length
    ? await supabase.storage.from("contracts").createSignedUrls(contractPaths, 600)
    : { data: [] };
  const contractUrlByPath = new Map((contractSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const { data: depositRows } = await supabase
    .from("deposit_transactions")
    .select("id, type, amount, currency, transaction_date, note")
    .eq("tenancy_id", id)
    .order("transaction_date", { ascending: true });

  const { data: attachmentRows } = await supabase
    .from("attachments")
    .select("id, file_name, size_bytes, note, created_at, storage_path")
    .eq("entity_type", "tenancy")
    .eq("entity_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  const attachmentPaths = (attachmentRows ?? []).map((a) => a.storage_path).filter((p): p is string => !!p);
  const { data: attachmentSignedUrls } = attachmentPaths.length
    ? await supabase.storage.from("attachments").createSignedUrls(attachmentPaths, 600)
    : { data: [] };
  const attachmentUrlByPath = new Map((attachmentSignedUrls ?? []).map((s) => [s.path, s.signedUrl]));

  const { consumption, cost, consumptionSeries, meteredSeries } = await getTenancyChartData(
    supabase,
    id,
    12,
    new Date().toISOString().slice(0, 10),
  );

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
    </div>
  );
}
