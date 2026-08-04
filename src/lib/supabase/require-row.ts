import type { PostgrestError } from "@supabase/supabase-js";

// A Supabase `.maybeSingle()` query resolves { data: null, error: null } for
// "row genuinely doesn't exist" and { data: null, error } for a real query
// failure (bad column, RLS denial, etc). Callers that only check `!data`
// before calling notFound() can't tell the two apart, which silently turns
// a real error into a wrong 404 (see IDEAS.md's "error-swallowing pattern").
export function assertNoQueryError(context: string, error: PostgrestError | null) {
  if (!error) return;
  console.error(`[${context}] Supabase query failed:`, error.message);
  throw new Error(`${context}: ${error.message}`);
}
