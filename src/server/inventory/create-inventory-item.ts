"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const CreateInventoryItemSchema = z.object({
  unitId: z.string().uuid(),
  kind: z.enum(["item", "facility"]).default("item"),
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  ownedBy: z.enum(["owner", "renter", "conditional"]).default("owner"),
  condition: z.string().trim().min(1).nullable().optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  actionByDate: z.string().min(1).nullable().optional(),
  actionByReason: z.string().trim().min(1).nullable().optional(),
});

export async function createInventoryItem(input: z.infer<typeof CreateInventoryItemSchema>) {
  const parsed = CreateInventoryItemSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  // A facility is always owner-owned (DB CHECK inventory_items_facility_
  // owner_owned); normalise here so the form never has to send it.
  const ownedBy = parsed.kind === "facility" ? "owner" : parsed.ownedBy;

  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      unit_id: parsed.unitId,
      kind: parsed.kind,
      title: parsed.title,
      description: parsed.description ?? null,
      owned_by: ownedBy,
      condition: parsed.condition ?? null,
      notes: parsed.notes ?? null,
      action_by_date: parsed.actionByDate ?? null,
      action_by_reason: parsed.actionByReason ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "inventory_item",
    entityId: item.id,
    actorId: personId,
    action: "create",
    after: { kind: parsed.kind, title: parsed.title, ownedBy },
  });

  return { id: item.id as string };
}
