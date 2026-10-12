import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoQueryError } from "@/lib/supabase/require-row";

export interface RequestItemOption {
  id: string;
  title: string;
  kind: "item" | "facility";
  tenancyId: string;
}

/**
 * B-36: the active inventory items and facilities a repair request can
 * name, one entry per active tenancy of the item's unit. RLS does the
 * scoping: a tenant sees only their own tenancy and unit, an owner the
 * properties they own — so the same helper serves both dialogs.
 */
export async function getRequestItemOptions(supabase: SupabaseClient): Promise<RequestItemOption[]> {
  const { data: tenancies, error } = await supabase.from("tenancies").select("id, unit_id").eq("status", "active");
  assertNoQueryError("request item options: tenancies", error);
  const unitIds = [...new Set((tenancies ?? []).map((t) => t.unit_id as string))];
  if (unitIds.length === 0) return [];

  const { data: items, error: itemsError } = await supabase
    .from("inventory_items")
    .select("id, unit_id, kind, title")
    .in("unit_id", unitIds)
    .eq("status", "active")
    .order("title");
  assertNoQueryError("request item options: items", itemsError);

  return (tenancies ?? []).flatMap((t) =>
    (items ?? [])
      .filter((i) => i.unit_id === t.unit_id)
      .map((i) => ({ id: i.id, title: i.title, kind: i.kind as "item" | "facility", tenancyId: t.id })),
  );
}
