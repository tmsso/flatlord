"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";

const RevokeInviteSchema = z.object({
  inviteId: z.string().uuid(),
});

export async function revokeInvite(input: { inviteId: string }) {
  const { inviteId } = RevokeInviteSchema.parse(input);
  const supabase = await createClient();
  // Fails fast for a non-owner; RLS (owner_update_invites) is the real
  // enforcement.
  await requireOwnerPersonId(supabase);

  const { error } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .is("consumed_at", null);

  if (error) throw new Error(error.message);
}
