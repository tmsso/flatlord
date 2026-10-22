"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { fail, type ActionResult } from "@/lib/action-result";

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
  // B-38 / D-31: item ↔ facility is convertible. Omitted = keep stored kind.
  kind: z.enum(["item", "facility"]).optional(),
});

export async function updateInventoryItem(input: z.infer<typeof UpdateInventoryItemSchema>): Promise<ActionResult> {
  const parsed = UpdateInventoryItemSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: before } = await supabase
    .from("inventory_items")
    .select("kind, title, owned_by, status")
    .eq("id", parsed.id)
    .maybeSingle();

  // D-31: kind is convertible. A facility is always owner-owned (DB CHECK
  // inventory_items_facility_owner_owned), so converting an item requires
  // it to be owner-owned *already* — a renter's or conditional item has to
  // change owner first, deliberately as its own audited step rather than
  // silently as a side effect of the conversion.
  const kind = parsed.kind ?? before?.kind ?? "item";
  if (kind === "facility" && before?.kind !== "facility" && before?.owned_by !== "owner") {
    return fail("facilityNeedsOwner");
  }
  const ownedBy = kind === "facility" ? "owner" : parsed.ownedBy;

  const { error } = await supabase
    .from("inventory_items")
    .update({
      title: parsed.title,
      description: parsed.description ?? null,
      kind,
      owned_by: ownedBy,
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
    after: { kind, title: parsed.title, ownedBy, status: parsed.status },
  });
  return { ok: true };
}
