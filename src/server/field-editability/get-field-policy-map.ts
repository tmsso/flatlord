import type { SupabaseClient } from "@supabase/supabase-js";
import { FIELD_POLICIES, type FieldPolicy } from "@/db/schema/field-policies-values";

// Policies are per root property since migration 0032 (owner isolation):
// rows with that property_id are the owner's settings, rows with a null
// property_id are the built-in defaults every property falls back to. A
// property row wins over a default for the same field. `scope` (the
// original free-form override key) is unused — only scope-null rows count.
// propertyId null (e.g. a tenant with no active tenancy) → defaults only.
export async function getFieldPolicyMap(
  supabase: SupabaseClient,
  entityType: string,
  propertyId: string | null,
): Promise<Map<string, FieldPolicy>> {
  let query = supabase
    .from("field_policies")
    .select("field_name, policy, property_id")
    .eq("entity_type", entityType)
    .is("scope", null);
  query = propertyId ? query.or(`property_id.is.null,property_id.eq.${propertyId}`) : query.is("property_id", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const map = new Map<string, FieldPolicy>();
  // Defaults first, then property rows overwrite them.
  const rows = [...(data ?? [])].sort((a, b) => Number(a.property_id !== null) - Number(b.property_id !== null));
  for (const row of rows) {
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

// The root property whose policies govern a tenant's self-edits: their
// active tenancy's (as primary tenant, else as a current co-occupant).
export async function resolveTenantPolicyPropertyId(
  supabase: SupabaseClient,
  personId: string,
): Promise<string | null> {
  const { data: primary, error: primaryError } = await supabase
    .from("tenancies")
    .select("property_id")
    .eq("primary_tenant_id", personId)
    .eq("status", "active")
    .limit(1);
  if (primaryError) throw new Error(primaryError.message);
  if (primary?.[0]) return primary[0].property_id as string;

  const { data: occupant, error: occupantError } = await supabase
    .from("tenancy_occupants")
    .select("tenancies!inner(property_id, status)")
    .eq("person_id", personId)
    .is("move_out", null)
    .eq("tenancies.status", "active")
    .limit(1);
  if (occupantError) throw new Error(occupantError.message);
  const tenancy = occupant?.[0]?.tenancies as unknown as { property_id: string } | undefined;
  return tenancy?.property_id ?? null;
}
