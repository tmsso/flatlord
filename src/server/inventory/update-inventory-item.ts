"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const UpdateInventoryItemSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  ownedBy: z.enum(["owner", "renter", "conditional"]),
  condition: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  actionByDate: z.string().min(1).nullable().optional(),
  actionByReason: z.string().trim().min(1).nullable().optional(),
  // Never DELETE (CLAUDE.md §3.5) — "removed"/"transferred" are terminal
  // status values set through this same update path.
  status: z.enum(["active", "removed", "transferred"]),
});

export async function updateInventoryItem(input: z.infer<typeof UpdateInventoryItemSchema>) {
  const parsed = UpdateInventoryItemSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: before } = await supabase
    .from("inventory_items")
    .select("title, owned_by, status")
    .eq("id", parsed.id)
    .maybeSingle();

  const { error } = await supabase
    .from("inventory_items")
    .update({
      title: parsed.title,
      description: parsed.description ?? null,
      owned_by: parsed.ownedBy,
      condition: parsed.condition ?? null,
      notes: parsed.notes ?? null,
      action_by_date: parsed.actionByDate ?? null,
      action_by_reason: parsed.actionByReason ?? null,
      status: parsed.status,
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "inventory_item",
    entityId: parsed.id,
    actorId: personId,
    action: "update",
    before: before ?? null,
    after: { title: parsed.title, ownedBy: parsed.ownedBy, status: parsed.status },
  });
}
