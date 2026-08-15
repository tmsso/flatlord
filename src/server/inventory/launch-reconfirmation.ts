"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const LaunchReconfirmationSchema = z.object({
  tenancyId: z.string().uuid(),
  scope: z.enum(["full", "subset"]),
  itemIds: z.array(z.string().uuid()).optional(),
  dueDate: z.string().min(1).nullable().optional(),
  note: z.string().trim().min(1).nullable().optional(),
});

// Admin-triggered reconfirmation campaign (CLAUDE.md §3.9): 'full' covers
// every active item on the tenancy's unit at launch time, 'subset' covers
// only the admin-picked itemIds. One inventory_reconfirmation_items row
// per item in scope, created here rather than lazily — the tenant's
// reconfirmation UI just lists whatever rows already exist for the open
// campaign, no separate "which items are in this campaign" resolution
// needed client-side.
export async function launchReconfirmation(input: z.infer<typeof LaunchReconfirmationSchema>) {
  const parsed = LaunchReconfirmationSchema.parse(input);
  if (parsed.scope === "subset" && (!parsed.itemIds || parsed.itemIds.length === 0)) {
    throw new Error("subsetRequiresItems");
  }
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("id, unit_id")
    .eq("id", parsed.tenancyId)
    .single();
  if (tenancyError) throw new Error(tenancyError.message);

  let itemIds = parsed.itemIds ?? [];
  if (parsed.scope === "full") {
    const { data: activeItems, error: itemsError } = await supabase
      .from("inventory_items")
      .select("id")
      .eq("unit_id", tenancy.unit_id)
      .eq("status", "active");
    if (itemsError) throw new Error(itemsError.message);
    itemIds = (activeItems ?? []).map((i) => i.id);
  }
  if (itemIds.length === 0) throw new Error("noItemsInScope");

  const { data: campaign, error: campaignError } = await supabase
    .from("inventory_reconfirmations")
    .insert({
      tenancy_id: parsed.tenancyId,
      scope: parsed.scope,
      initiated_by: personId,
      due_date: parsed.dueDate ?? null,
      note: parsed.note ?? null,
    })
    .select("id")
    .single();
  if (campaignError) throw new Error(campaignError.message);

  const { error: itemsInsertError } = await supabase.from("inventory_reconfirmation_items").insert(
    itemIds.map((inventoryItemId) => ({
      reconfirmation_id: campaign.id,
      inventory_item_id: inventoryItemId,
    })),
  );
  if (itemsInsertError) throw new Error(itemsInsertError.message);

  await logAudit(supabase, {
    entityType: "inventory_reconfirmation",
    entityId: campaign.id,
    actorId: personId,
    action: "create",
    after: { tenancyId: parsed.tenancyId, scope: parsed.scope, itemCount: itemIds.length },
  });

  return { id: campaign.id as string };
}
