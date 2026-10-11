import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { TenantRequestsList, type TenantRequestRow } from "@/components/requests/tenant-requests-list";
import type { RequestCategory, RequestStatus } from "@/db/schema/requests";
import { getRequestItemOptions } from "@/lib/requests/get-request-item-options";

export default async function TenantRequestsPage() {
  const supabase = await createClient();

  const [{ data: requestRows, error }, itemOptions] = await Promise.all([
    supabase.from("requests").select("id, category, status, title, created_at").order("created_at", { ascending: false }),
    getRequestItemOptions(supabase),
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
      <TenantRequestsList requests={requests} itemOptions={itemOptions} />
    </div>
  );
}
