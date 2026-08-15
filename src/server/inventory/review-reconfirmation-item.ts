"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const ReviewReconfirmationItemSchema = z.object({
  id: z.string().uuid(),
});

// Admin clears a flagged discrepancy from the "needs review" queue after
// following up with the tenant out-of-band — sets it back to 'confirmed'.
// Not a full resolution workflow (that's what a real Phase 3 request
// would give); see ROADMAP Phase 2 item 6 scope note.
export async function reviewReconfirmationItem(input: z.infer<typeof ReviewReconfirmationItemSchema>) {
  const parsed = ReviewReconfirmationItemSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { error } = await supabase
    .from("inventory_reconfirmation_items")
    .update({ status: "confirmed" })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "inventory_reconfirmation_item",
    entityId: parsed.id,
    actorId: personId,
    action: "review",
    after: { status: "confirmed" },
  });
}
