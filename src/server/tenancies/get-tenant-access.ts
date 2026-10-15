import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type TenantAccess =
  | { kind: "active" }
  | { kind: "invited"; email: string; expiresAt: string }
  | { kind: "none"; lastEmail: string | null };

// Portal-access state of a tenant person, for the owner's tenancy page.
// `supabase` is the owner's own client: the invites read goes through RLS
// (owner_scope_invites). Whether the person already has a login is a
// profiles row, which owners can't SELECT (self-only policy) — so that one
// lookup uses the service role. Only call this for a person the caller
// already loaded through RLS (the tenancy's primary tenant).
export async function getTenantAccess(supabase: SupabaseClient, personId: string): Promise<TenantAccess> {
  const { data: login, error: loginError } = await createServiceRoleClient()
    .from("profiles")
    .select("id")
    .eq("person_id", personId)
    .eq("role", "tenant")
    .limit(1);
  if (loginError) throw new Error(`tenant access: ${loginError.message}`);
  if (login?.length) return { kind: "active" };

  const { data: invites, error } = await supabase
    .from("invites")
    .select("email, expires_at, consumed_at, revoked_at")
    .eq("person_id", personId)
    .eq("role", "tenant")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) throw new Error(`tenant access: ${error.message}`);
  const now = new Date().toISOString();
  const live = (invites ?? []).find((i) => !i.consumed_at && !i.revoked_at && i.expires_at > now);
  if (live) return { kind: "invited", email: live.email, expiresAt: live.expires_at };
  return { kind: "none", lastEmail: invites?.[0]?.email ?? null };
}
