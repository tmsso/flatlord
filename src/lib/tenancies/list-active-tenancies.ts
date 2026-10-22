import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoQueryError } from "@/lib/supabase/require-row";

export interface TenancyOption {
  id: string;
  // "<unit name> · <primary tenant>" — enough to tell two tenancies apart
  // in a picker without another round-trip.
  label: string;
}

type Ref<T> = T | T[] | null;
const one = <T,>(r: Ref<T>): T | null => (Array.isArray(r) ? (r[0] ?? null) : r);

// B-51: every active tenancy the caller can see (owner_scope RLS limits it
// to their own properties), oldest term_start first — the same order the
// dashboard uses to pick its default, so "no ?tenancy= param" means the
// same tenancy everywhere.
export async function listActiveTenancies(supabase: SupabaseClient): Promise<TenancyOption[]> {
  const { data, error } = await supabase
    .from("tenancies")
    .select("id, properties(name), persons(given_name, family_name)")
    .eq("status", "active")
    .order("term_start", { ascending: true });
  assertNoQueryError("listActiveTenancies", error);

  return (data ?? []).map((row) => {
    const unit = one(row.properties as unknown as Ref<{ name: string }>);
    const person = one(row.persons as unknown as Ref<{ given_name: string; family_name: string }>);
    const parts = [unit?.name, person ? `${person.given_name} ${person.family_name}` : null].filter(Boolean);
    return { id: row.id, label: parts.join(" · ") || row.id.slice(0, 8) };
  });
}

// The ?tenancy= param is user-controlled: only honour it when it names one
// of the caller's own active tenancies, otherwise fall back to the default.
export function pickTenancy(options: TenancyOption[], requested: string | undefined): TenancyOption | null {
  return options.find((o) => o.id === requested) ?? options[0] ?? null;
}
