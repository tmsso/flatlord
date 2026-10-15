import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { AdminRequestsDashboard, type AdminRequestRow } from "@/components/requests/admin-requests-dashboard";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";
import { getRequestItemOptions } from "@/lib/requests/get-request-item-options";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getOwnerModules } from "@/server/modules/get-modules";

type TenancyRef = {
  properties: { id: string; name: string } | { id: string; name: string }[] | null;
  persons: { given_name: string; family_name: string } | { given_name: string; family_name: string }[] | null;
};

function one<T>(ref: T | T[] | null): T | null {
  return Array.isArray(ref) ? (ref[0] ?? null) : ref;
}

export default async function AdminRequestsPage() {
  const supabase = await createClient();
  // B-45: requests module off = no request list (data kept, D-33).
  const profile = await getCurrentProfile(supabase);
  if (!(await getOwnerModules(supabase, profile.userId)).has("requests")) notFound();

  const { data: requestRows, error } = await supabase
    .from("requests")
    .select(
      "id, category, status, title, created_at, external_case_ref, appointment_date, tenancy_id, tenancies(unit_id, primary_tenant_id, properties(id, name), persons(given_name, family_name))",
    )
    .order("created_at", { ascending: false });
  assertNoQueryError("requests", error);

  const [{ data: tenancyRows }, itemOptions] = await Promise.all([
    supabase
      .from("tenancies")
      .select("id, properties(name), persons(given_name, family_name)")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    getRequestItemOptions(supabase),
  ]);

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
      externalCaseRef: r.external_case_ref,
      appointmentDate: r.appointment_date,
    };
  });

  // "<flat> · <tenant>" — the owner picks a flat, so the flat leads
  // (B-33: prod showed a UUID here, then only the tenant's name).
  type PersonRef = { given_name: string; family_name: string };
  type UnitRef = { name: string };
  const tenancyOptions = (tenancyRows ?? []).map((t) => {
    const person = one(t.persons as unknown as PersonRef | PersonRef[] | null);
    const unit = one(t.properties as unknown as UnitRef | UnitRef[] | null);
    const parts = [unit?.name, person ? `${person.given_name} ${person.family_name}` : null].filter(Boolean);
    return { id: t.id, label: parts.length ? parts.join(" · ") : "—" };
  });

  return (
    <div className="flex flex-col gap-4">
      <AdminRequestsDashboard requests={requests} tenancyOptions={tenancyOptions} itemOptions={itemOptions} />
    </div>
  );
}
