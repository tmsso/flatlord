import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toModuleSet, type ModuleSet } from "@/lib/modules";
import { resolveTenantPolicyPropertyId } from "@/server/field-editability/get-field-policy-map";

// What the owner's own UI shows: their own switches (D-33 is per owner).
export async function getOwnerModules(supabase: SupabaseClient, userId: string): Promise<ModuleSet> {
  const { data, error } = await supabase.from("profiles").select("enabled_modules").eq("id", userId).maybeSingle();
  if (error) throw new Error(`owner modules: ${error.message}`);
  return toModuleSet(data?.enabled_modules as string[] | undefined);
}

// What a property's tenants (and crons) follow: on if ANY of its owners has
// it on. The RPC answers only for the property's own owners and tenants.
export async function getPropertyModules(supabase: SupabaseClient, propertyId: string): Promise<ModuleSet> {
  const { data, error } = await supabase.rpc("property_enabled_modules", { p_property_id: propertyId });
  if (error) throw new Error(`property modules: ${error.message}`);
  return toModuleSet(data as string[] | null);
}

// A tenant follows the property of their active tenancy; with none, every
// optional module is off for them.
export async function getTenantModules(supabase: SupabaseClient, personId: string): Promise<ModuleSet> {
  const propertyId = await resolveTenantPolicyPropertyId(supabase, personId);
  return propertyId ? getPropertyModules(supabase, propertyId) : new Set();
}

// Service-role variant for crons (no session, so no RPC caller check):
// same "any owner has it on" rule, computed from the tables. Memoise per
// run — the cron loops over many rows of few properties.
export function createPropertyModuleLookup(service: SupabaseClient) {
  const cache = new Map<string, Promise<ModuleSet>>();
  return (propertyId: string): Promise<ModuleSet> => {
    let hit = cache.get(propertyId);
    if (!hit) {
      hit = (async () => {
        const { data: owners, error } = await service.from("property_ownership").select("person_id").eq("property_id", propertyId);
        if (error) throw new Error(`property owners: ${error.message}`);
        const personIds = (owners ?? []).map((o) => o.person_id as string);
        if (personIds.length === 0) return new Set<never>();
        const { data: profiles, error: profileError } = await service
          .from("profiles")
          .select("enabled_modules")
          .eq("role", "owner")
          .in("person_id", personIds);
        if (profileError) throw new Error(`owner modules: ${profileError.message}`);
        return toModuleSet((profiles ?? []).flatMap((p) => (p.enabled_modules as string[]) ?? []));
      })();
      cache.set(propertyId, hit);
    }
    return hit;
  };
}
