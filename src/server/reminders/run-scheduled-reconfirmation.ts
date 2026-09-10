import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logAudit } from "@/server/audit/log";
import { notifyReconfirmationScheduled } from "@/server/notifications/notify-reconfirmation-scheduled";
import {
  addDaysUtc,
  isReconfirmationDueDay,
  resolveReconfirmationSchedule,
} from "@/server/reminders/compute-reconfirmation-schedule";

// The daily cron's scheduled inventory-reconfirmation trigger (ROADMAP
// Phase 4a — the last deferred cron shape). Unlike every other reminder
// this one *creates rows*: a full-scope `inventory_reconfirmations`
// campaign + one `inventory_reconfirmation_items` row per active item,
// exactly mirroring launchReconfirmation.ts's manual path.
//
// Opt-in per tenancy: it does nothing unless the tenancy has set
// `reminder_lead_days.reconfirmation.intervalMonths`. It also never
// stacks on an already-open campaign, and a manual campaign resets the
// cadence clock (the runner reads the most recent campaign's start date,
// auto *or* manual, as the anchor). Both are deliberate — a scheduled
// campaign hands the real tenant a task list.
//
// Trust rule: this autonomously INSERTs campaign rows that create tenant-
// facing work. It is gated entirely on explicit per-tenancy config.
//
// Best-effort per tenancy: one failure is logged, the loop continues.
export async function runScheduledReconfirmation(service: SupabaseClient, today: string) {
  let campaignsLaunched = 0;

  const { data: tenancies, error } = await service
    .from("tenancies")
    .select("id, unit_id, property_id, reminder_lead_days")
    .eq("status", "active");
  if (error) {
    console.error("runScheduledReconfirmation: failed to load tenancies", error.message);
    return { reconfirmationTenancies: 0, campaignsLaunched };
  }

  for (const tenancy of tenancies ?? []) {
    try {
      const schedule = resolveReconfirmationSchedule(tenancy.reminder_lead_days);
      if (!schedule) continue;

      const { data: lastCampaign } = await service
        .from("inventory_reconfirmations")
        .select("id, initiated_at, status")
        .eq("tenancy_id", tenancy.id)
        .order("initiated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastCampaign?.status === "open") continue; // don't stack on an open one

      const lastInitiatedDate = (lastCampaign?.initiated_at as string | null) ?? null;
      if (!isReconfirmationDueDay(lastInitiatedDate, schedule, today)) continue;

      const { data: activeItems } = await service
        .from("inventory_items")
        .select("id")
        .eq("unit_id", tenancy.unit_id)
        .eq("status", "active");
      const itemIds = (activeItems ?? []).map((i) => i.id as string);
      if (itemIds.length === 0) continue; // nothing to reconfirm this cycle

      const { data: ownership } = await service
        .from("property_ownership")
        .select("person_id")
        .eq("property_id", tenancy.property_id)
        .limit(1)
        .maybeSingle();
      const initiatedBy = ownership?.person_id as string | undefined;
      if (!initiatedBy) {
        console.error("runScheduledReconfirmation: no owner person for property", tenancy.property_id);
        continue;
      }

      const dueDate = addDaysUtc(today, schedule.dueDays);

      const { data: campaign, error: campaignError } = await service
        .from("inventory_reconfirmations")
        .insert({
          tenancy_id: tenancy.id,
          scope: "full",
          initiated_by: initiatedBy,
          due_date: dueDate,
          note: null,
        })
        .select("id")
        .single();
      if (campaignError) throw new Error(campaignError.message);

      const { error: itemsError } = await service.from("inventory_reconfirmation_items").insert(
        itemIds.map((inventoryItemId) => ({
          reconfirmation_id: campaign.id,
          inventory_item_id: inventoryItemId,
        })),
      );
      if (itemsError) throw new Error(itemsError.message);

      await logAudit(service, {
        entityType: "inventory_reconfirmation",
        entityId: campaign.id as string,
        actorId: initiatedBy,
        action: "create",
        after: { tenancyId: tenancy.id, scope: "full", itemCount: itemIds.length, scheduled: true },
      });

      await notifyReconfirmationScheduled({ reconfirmationId: campaign.id as string });
      campaignsLaunched++;
    } catch (err) {
      console.error(
        "runScheduledReconfirmation: tenancy failed",
        tenancy.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { reconfirmationTenancies: tenancies?.length ?? 0, campaignsLaunched };
}
