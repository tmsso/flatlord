import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoQueryError } from "@/lib/supabase/require-row";
import type { HandoverSnapshotRow } from "@/components/handover-section";

// B-13: the tenancy's handover snapshots, newest first (RLS-scoped — the
// owner sees their property's, the tenant their own tenancy's, D-49).
export async function loadHandoverSnapshots(supabase: SupabaseClient, tenancyId: string): Promise<HandoverSnapshotRow[]> {
  const { data, error } = await supabase
    .from("handover_snapshots")
    .select("id, kind, taken_at, inventory, meters")
    .eq("tenancy_id", tenancyId)
    .order("taken_at", { ascending: false });
  assertNoQueryError("handover_snapshots", error);
  return (data ?? []).map((s) => ({
    id: s.id,
    kind: s.kind as "move_in" | "move_out",
    takenAt: s.taken_at,
    itemCount: Array.isArray(s.inventory) ? s.inventory.length : 0,
    meterCount: Array.isArray(s.meters) ? s.meters.length : 0,
  }));
}
