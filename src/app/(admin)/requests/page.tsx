import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { AdminRequestsDashboard, type AdminRequestRow } from "@/components/requests/admin-requests-dashboard";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";

type TenancyRef = {
  properties: { id: string; name: string } | { id: string; name: string }[] | null;
  persons: { given_name: string; family_name: string } | { given_name: string; family_name: string }[] | null;
};

function one<T>(ref: T | T[] | null): T | null {
  return Array.isArray(ref) ? (ref[0] ?? null) : ref;
}

export default async function AdminRequestsPage() {
  const supabase = await createClient();

  const { data: requestRows, error } = await supabase
    .from("requests")
    .select(
      "id, category, status, title, created_at, tenancy_id, tenancies(unit_id, primary_tenant_id, properties(id, name), persons(given_name, family_name))",
    )
    .order("created_at", { ascending: false });
  assertNoQueryError("requests", error);

  const { data: tenancyRows } = await supabase
    .from("tenancies")
    .select("id, persons(given_name, family_name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const requests: AdminRequestRow[] = (requestRows ?? []).map((r) => {
    const tenancyRef = one(r.tenancies as unknown as TenancyRef | TenancyRef[] | null);
    const property = one(tenancyRef?.properties ?? null);
    const person = one(tenancyRef?.persons ?? null);
    return {
      id: r.id,
      category: r.category as RequestCategory,
      status: r.status as RequestStatus,
      title: r.title,
      createdAt: r.created_at,
      propertyId: property?.id ?? "",
      propertyName: property?.name ?? "—",
      tenantName: person ? `${person.given_name} ${person.family_name}` : "—",
    };
  });

  type PersonRef = { given_name: string; family_name: string };
  const tenancyOptions = (tenancyRows ?? []).map((t) => {
    const person = one(t.persons as unknown as PersonRef | PersonRef[] | null);
    return { id: t.id, label: person ? `${person.given_name} ${person.family_name}` : t.id };
  });

  return (
    <div className="flex flex-col gap-4">
      <AdminRequestsDashboard requests={requests} tenancyOptions={tenancyOptions} />
    </div>
  );
}
