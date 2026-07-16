"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const RevokeInviteSchema = z.object({
  inviteId: z.string().uuid(),
});

export async function revokeInvite(input: { inviteId: string }) {
  const { inviteId } = RevokeInviteSchema.parse(input);
  const supabase = await createClient();

  // RLS (owner_update_invites) enforces only an owner can reach this.
  const { error } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("consumed_at", null);

  if (error) throw new Error(error.message);
}
