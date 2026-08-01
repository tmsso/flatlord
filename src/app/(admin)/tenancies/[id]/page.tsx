import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { TenancyDetail } from "@/components/tenancy-detail";

type PersonRef = { given_name: string; family_name: string };
type PropertyRef = { name: string };

export default async function TenancyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("tenancies");
  const supabase = await createClient();

  const { data: tenancy } = await supabase
    .from("tenancies")
    .select(
      "id, unit_id, primary_tenant_id, primary_tenant_registration_type, term_start, term_end, notice_days, due_day, status, properties(name), persons(given_name, family_name)",
    )
    .eq("id", id)
    .maybeSingle();
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
    </div>
  );
}
