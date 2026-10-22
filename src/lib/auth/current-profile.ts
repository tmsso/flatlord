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
//
// B-03: layouts pass { verify: "claims" } — the proxy has already checked
// the session on this request, so a local JWT verification is enough to
// render. Server actions keep the default getUser() round trip (defence in
// depth for writes).
export async function getCurrentProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  options: { verify?: "user" | "claims" } = {},
): Promise<CurrentProfile> {
  let userId: string | undefined;
  if (options.verify === "claims") {
    const { data } = await supabase.auth.getClaims();
    userId = data?.claims.sub;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id;
  }
  if (!userId) throw new Error("Not authenticated");

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("person_id, role")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  if (!profile.person_id) throw new Error("Caller has no person record");

  return { userId, personId: profile.person_id, role: profile.role };
}
