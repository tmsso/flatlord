import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { AdminNoticesDashboard, type AdminNoticeRow } from "@/components/notices/admin-notices-dashboard";
import type { NoticeType } from "@/db/schema/notices";

type TenancyRef = {
  properties: { id: string; name: string } | { id: string; name: string }[] | null;
  persons: { given_name: string; family_name: string } | { given_name: string; family_name: string }[] | null;
};

function one<T>(ref: T | T[] | null): T | null {
  return Array.isArray(ref) ? (ref[0] ?? null) : ref;
}

export default async function AdminNoticesPage() {
  const supabase = await createClient();

  const { data: noticeRows, error } = await supabase
    .from("notices")
    .select(
      "id, type, title, created_at, requires_acknowledgement, acknowledged_at, tenancy_id, tenancies(unit_id, primary_tenant_id, properties(id, name), persons(given_name, family_name))",
    )
    .order("created_at", { ascending: false });
  assertNoQueryError("notices", error);

  const { data: tenancyRows } = await supabase
    .from("tenancies")
    .select("id, persons(given_name, family_name)")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  const notices: AdminNoticeRow[] = (noticeRows ?? []).map((n) => {
    const tenancyRef = one(n.tenancies as unknown as TenancyRef | TenancyRef[] | null);
    const property = one(tenancyRef?.properties ?? null);
    const person = one(tenancyRef?.persons ?? null);
    return {
      id: n.id,
      type: n.type as NoticeType,
      title: n.title,
      createdAt: n.created_at,
      requiresAcknowledgement: n.requires_acknowledgement,
      acknowledgedAt: n.acknowledged_at,
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
      <AdminNoticesDashboard notices={notices} tenancyOptions={tenancyOptions} />
    </div>
  );
}
