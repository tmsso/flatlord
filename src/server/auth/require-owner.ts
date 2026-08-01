import type { SupabaseClient } from "@supabase/supabase-js";

// Repeated identically across every new properties/tenancies/persons
// action below (8+ call sites) — worth the shared helper, unlike the
// existing one-off repetitions in verify-meter-reading.ts/record-payment.ts.
// RLS is still the actual enforcement (CLAUDE.md §6: "RLS is the last
// line of defence, not the only one") — this just gives a clean error
// before a query even reaches Postgres, and resolves the caller's
// persons.id for audit_log.actorId (which is a person, not an auth
// identity, matching recordedBy/confirmedBy elsewhere).
export async function requireOwnerPersonId(
  supabase: SupabaseClient,
): Promise<{ userId: string; personId: string }> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: profile } = await supabase
    .from("profiles")
    .select("person_id, role")
    .eq("id", user.id)
    .single();
  if (!profile?.person_id) throw new Error("Caller has no person record");
  if (profile.role !== "owner") throw new Error("Not authorized");

  return { userId: user.id, personId: profile.person_id };
}
