import type { SupabaseClient } from "@supabase/supabase-js";
import { FIELD_POLICIES, type FieldPolicy } from "@/db/schema/field-policies-values";

// v1 only ever writes global (scope = NULL) rows — see migration 0021's
// comment — so resolution here is intentionally simple: one row per
// (entityType, fieldName), no scope-override lookup yet. The schema
// already supports scope for whenever that's needed (per-property policy
// overrides), this helper just doesn't have to resolve it today.
export async function getFieldPolicyMap(
  supabase: SupabaseClient,
  entityType: string,
): Promise<Map<string, FieldPolicy>> {
  const { data, error } = await supabase
    .from("field_policies")
    .select("field_name, policy")
    .eq("entity_type", entityType)
    .is("scope", null);
  if (error) throw new Error(error.message);

  const map = new Map<string, FieldPolicy>();
  for (const row of data ?? []) {
    if (FIELD_POLICIES.includes(row.policy as FieldPolicy)) {
      map.set(row.field_name, row.policy as FieldPolicy);
    }
  }
  return map;
}

// CLAUDE.md §3.5: "Default read_only."
export function resolveFieldPolicy(map: Map<string, FieldPolicy>, fieldName: string): FieldPolicy {
  return map.get(fieldName) ?? "read_only";
}
