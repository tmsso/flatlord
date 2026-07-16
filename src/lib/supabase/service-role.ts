import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role key bypasses RLS entirely — never import this file from
// anything that could run in the browser. Used only for admin-only
// operations that must act outside a user's own RLS scope (e.g. creating
// an invite before the invited person has any session at all).
export function createServiceRoleClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
