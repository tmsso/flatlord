"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const SendMagicLinkSchema = z.object({
  email: z.string().email(),
});

// Only a live invite may create an auth account. Without this,
// signInWithOtp's default (shouldCreateUser: true) let any typed-in
// address mint an auth.users row — handle_new_user() then finds no invite,
// so the row is an orphan the proxy signs out, but it still exists and
// Supabase still sends that stranger a login email. Existing accounts are
// unaffected: shouldCreateUser only governs *new* users.
//
// Google sign-in is a separate path (browser → Supabase OAuth) this can't
// gate; there the proxy's no-profile sign-out remains the safety net.
async function hasLiveInvite(email: string): Promise<boolean> {
  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("invites")
    .select("id")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .is("consumed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .limit(1);
  if (error) {
    // Fail closed: an invitee can retry, a stray signup can't be undone.
    console.error("sendMagicLink invite lookup failed:", error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

export async function sendMagicLink(input: { email: string }) {
  const { email } = SendMagicLinkSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      shouldCreateUser: await hasLiveInvite(email),
    },
  });

  // Never reveal whether an account/invite exists for this email — same
  // response either way (invite-only app; enumeration would leak who's
  // been invited). An uninvited, unknown address lands here as Supabase's
  // "Signups not allowed for otp" error and gets the same "check your
  // inbox" screen as everyone else.
  if (error) {
    console.error("sendMagicLink error:", error.message);
  }
  return { ok: true };
}
