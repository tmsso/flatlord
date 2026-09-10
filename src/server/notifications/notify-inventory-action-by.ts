import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyOwners } from "@/server/notifications/notify-owners";

// "This inventory item's action-by date is in N days" owner alert
// (ROADMAP Phase 4 lead-reminder batch) — the conditional-ownership real
// case from CLAUDE.md §3.9 (an appliance whose ownership transfers
// depending on the tenancy end date). Fires
// reminder_lead_days.inventoryActionBy days (default 14) before
// inventory_items.action_by_date. Fired by the daily cron. Best-effort,
// never throws. Reuses the existing `inventory` notification category.
export async function notifyInventoryActionBy(params: { inventoryItemId: string; leadDays: number }) {
  try {
    const service = createServiceRoleClient();
    const { data: item, error } = await service
      .from("inventory_items")
      .select("id, property_id, title, action_by_date, action_by_reason")
      .eq("id", params.inventoryItemId)
      .maybeSingle();
    if (error || !item || !item.property_id || !item.action_by_date) {
      console.error("notifyInventoryActionBy: item not resolvable", params.inventoryItemId, error?.message);
      return;
    }

    await notifyOwners({
      propertyId: item.property_id,
      category: "inventory",
      entityType: "inventory_item",
      entityId: item.id,
      build: (t) => ({
        subject: t("inventoryActionBySubject", { title: item.title }),
        body: t("inventoryActionByBody", {
          title: item.title,
          days: params.leadDays,
          date: item.action_by_date as string,
          reason: (item.action_by_reason as string | null) ?? "—",
        }),
      }),
    });
  } catch (err) {
    console.error("notifyInventoryActionBy: unexpected failure", err instanceof Error ? err.message : err);
  }
}
