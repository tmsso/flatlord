import type { createClient } from "@/lib/supabase/server";

export interface CurrentProfile {
  userId: string;
  personId: string;
  role: "owner" | "tenant";
}

// Factors out the auth.getUser() -> profiles lookup already duplicated
// across the M4 server actions (record-payment.ts, submit-meter-reading.ts,
// verify-meter-reading.ts) — those aren't refactored to use this (out of
// scope for a UI milestone), but new pages use it going forward.
export async function getCurrentProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<CurrentProfile> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("person_id, role")
    .eq("id", user.id)
    .single();
  if (error) throw new Error(error.message);
  if (!profile.person_id) throw new Error("Caller has no person record");

  return { userId: user.id, personId: profile.person_id, role: profile.role };
}
