import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { TenantRequestsList, type TenantRequestRow } from "@/components/requests/tenant-requests-list";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";
import { getRequestItemOptions } from "@/lib/requests/get-request-item-options";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getTenantModules } from "@/server/modules/get-modules";

export default async function TenantRequestsPage() {
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const [{ data: requestRows, error }, itemOptions, modules] = await Promise.all([
    supabase.from("requests").select("id, category, status, title, created_at").order("created_at", { ascending: false }),
    getRequestItemOptions(supabase),
    getTenantModules(supabase, profile.personId),
  ]);
  assertNoQueryError("home/requests", error);

  const requests: TenantRequestRow[] = (requestRows ?? []).map((r) => ({
    id: r.id,
    category: r.category as RequestCategory,
    status: r.status as RequestStatus,
    title: r.title,
    createdAt: r.created_at,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* No affected-item picker while the inventory module is off (B-45). */}
      <TenantRequestsList requests={requests} itemOptions={modules.has("inventory") ? itemOptions : []} />
    </div>
  );
}
