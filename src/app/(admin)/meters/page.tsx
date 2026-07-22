import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { MeterBatchesList } from "@/components/meter-batches-list";

export default async function AdminMetersPage() {
  const t = await getTranslations("meterReadings");
  const supabase = await createClient();

  // owner_scope_meter_readings already limits reads to properties the
  // caller owns. A "batch" (tenancy x month) is derived here, not stored —
  // see compute-meter-batch-progress.ts's module doc.
  const { data: readingRows } = await supabase
    .from("meter_readings")
    .select(
      "id, tenancy_id, reading_date, status, tenancies(primary_tenant_id, persons(given_name, family_name), properties(name))",
    )
    .order("reading_date", { ascending: false });

  const batches = new Map<
    string,
    { tenancyId: string; month: string; tenantName: string; propertyName: string; submittedCount: number }
  >();
  for (const r of readingRows ?? []) {
    const tenancy = Array.isArray(r.tenancies) ? r.tenancies[0] : r.tenancies;
    const person = tenancy && (Array.isArray(tenancy.persons) ? tenancy.persons[0] : tenancy.persons);
    const property = tenancy && (Array.isArray(tenancy.properties) ? tenancy.properties[0] : tenancy.properties);
    const month = r.reading_date.slice(0, 7);
    const key = `${r.tenancy_id}:${month}`;
    const existing = batches.get(key);
    const submittedIncrement = r.status === "submitted" ? 1 : 0;
    if (existing) {
      existing.submittedCount += submittedIncrement;
    } else {
      batches.set(key, {
        tenancyId: r.tenancy_id,
        month,
        tenantName: person ? `${person.given_name} ${person.family_name}` : "—",
        propertyName: property?.name ?? "—",
        submittedCount: submittedIncrement,
      });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{t("queueTitle")}</h1>
      <MeterBatchesList batches={[...batches.values()].sort((a, b) => b.month.localeCompare(a.month))} />
    </div>
  );
}
