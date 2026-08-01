"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

// Never hard-delete (CLAUDE.md §3.5) — ending an occupancy sets move_out,
// it doesn't remove the row. tenancy_occupants has no status flag of its
// own; move_out doubling as "ended" is consistent with move_in/move_out
// already being the row's only lifecycle dates.
const EndTenancyOccupancySchema = z.object({
  id: z.string().uuid(),
  moveOut: z.string().min(1),
});

export async function endTenancyOccupancy(input: z.infer<typeof EndTenancyOccupancySchema>) {
  const parsed = EndTenancyOccupancySchema.parse(input);
  const supabase = await createClient();
  const { personId: actorPersonId } = await requireOwnerPersonId(supabase);

  const { error } = await supabase
    .from("tenancy_occupants")
    .update({ move_out: parsed.moveOut })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "tenancy_occupant",
    entityId: parsed.id,
    actorId: actorPersonId,
    action: "end_occupancy",
    after: { moveOut: parsed.moveOut },
  });
}
