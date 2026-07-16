"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const SendMagicLinkSchema = z.object({
  email: z.string().email(),
});

export async function sendMagicLink(input: { email: string }) {
  const { email } = SendMagicLinkSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  // Never reveal whether an account/invite exists for this email — same
  // response either way (invite-only app; enumeration would leak who's
  // been invited).
  if (error) {
    console.error("sendMagicLink error:", error.message);
  }
  return { ok: true };
}
