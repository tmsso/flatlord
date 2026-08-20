import { createClient } from "@/lib/supabase/server";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import { TenantNoticesList, type TenantNoticeRow } from "@/components/notices/tenant-notices-list";
import type { NoticeType } from "@/db/schema/notices";

export default async function TenantNoticesPage() {
  const supabase = await createClient();

  const { data: noticeRows, error } = await supabase
    .from("notices")
    .select("id, type, title, created_at, requires_acknowledgement, acknowledged_at")
    .order("created_at", { ascending: false });
  assertNoQueryError("home/notices", error);

  const notices: TenantNoticeRow[] = (noticeRows ?? []).map((n) => ({
    id: n.id,
    type: n.type as NoticeType,
    title: n.title,
    createdAt: n.created_at,
    requiresAcknowledgement: n.requires_acknowledgement,
    acknowledgedAt: n.acknowledged_at,
  }));

  return (
    <div className="flex flex-col gap-4">
      <TenantNoticesList notices={notices} />
    </div>
  );
}
