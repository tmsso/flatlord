import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PropertyDetail } from "@/components/property-detail";

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("properties");
  const supabase = await createClient();

  const { data: property } = await supabase
    .from("properties")
    .select("id, parent_id, root_property_id, type, name, address_line, hrsz, letting_mode, active")
    .eq("id", id)
    .maybeSingle();
  if (!property) notFound();

  const isRoot = property.parent_id === null;

  const { data: ownershipRows } = isRoot
    ? await supabase
        .from("property_ownership")
        .select("id, person_id, percentage, persons(given_name, family_name)")
        .eq("property_id", property.root_property_id)
    : { data: [] };

  const { data: personRows } = await supabase.from("persons").select("id, given_name, family_name").order("family_name");

  const { data: childRows } = await supabase
    .from("properties")
    .select("id, name, type, hrsz, active")
    .eq("parent_id", id)
    .order("name");

  // Inhabitants of this specific unit: tenancies against it, plus their
  // occupants — property_id (denormalized root) isn't the right scope
  // here, unit_id (the actual lettable node) is.
  const { data: tenanciesForUnit } = await supabase
    .from("tenancies")
    .select("id, primary_tenant_id, primary_tenant_registration_type, status, persons(id, given_name, family_name)")
    .eq("unit_id", id)
    .neq("status", "terminated");

  const tenancyIds = (tenanciesForUnit ?? []).map((t) => t.id);
  const { data: occupantRows } = tenancyIds.length
    ? await supabase
        .from("tenancy_occupants")
        .select("id, tenancy_id, relationship, registration_type, move_out, persons(id, given_name, family_name)")
        .in("tenancy_id", tenancyIds)
        .is("move_out", null)
    : { data: [] };

  type PersonRef = { id: string; given_name: string; family_name: string };
  const inhabitants: { personId: string; name: string; registrationType: string | null; relationship: string }[] = [];
  for (const ten of tenanciesForUnit ?? []) {
    const person = ten.persons as unknown as PersonRef | PersonRef[] | null;
    const p = Array.isArray(person) ? person[0] : person;
    if (p) {
      inhabitants.push({
        personId: p.id,
        name: `${p.given_name} ${p.family_name}`,
        registrationType: ten.primary_tenant_registration_type,
        relationship: "primary",
      });
    }
  }
  for (const occ of occupantRows ?? []) {
    const person = occ.persons as unknown as PersonRef | PersonRef[] | null;
    const p = Array.isArray(person) ? person[0] : person;
    if (p) {
      inhabitants.push({
        personId: p.id,
        name: `${p.given_name} ${p.family_name}`,
        registrationType: occ.registration_type,
        relationship: occ.relationship,
      });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="text-xs text-muted-foreground">{t("title")}</div>
      <PropertyDetail
        property={{
          id: property.id,
          type: property.type,
          name: property.name,
          addressLine: property.address_line,
          hrsz: property.hrsz,
          lettingMode: property.letting_mode,
          active: property.active,
          isRoot,
        }}
        childProperties={(childRows ?? []).map((c) => ({ id: c.id, name: c.name, type: c.type, hrsz: c.hrsz, active: c.active }))}
        owners={(ownershipRows ?? []).map((o) => {
          const person = o.persons as unknown as PersonRef | PersonRef[] | null;
          const p = Array.isArray(person) ? person[0] : person;
          return { id: o.id, personName: p ? `${p.given_name} ${p.family_name}` : "—", percentage: Number(o.percentage) };
        })}
        inhabitants={inhabitants}
        tenancyId={tenanciesForUnit?.[0]?.id ?? null}
        persons={(personRows ?? []).map((p) => ({ id: p.id, name: `${p.given_name} ${p.family_name}` }))}
      />
    </div>
  );
}
