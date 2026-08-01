import type { SupabaseClient } from "@supabase/supabase-js";

export interface RequiredFieldRule {
  fieldName: string;
  required: boolean;
  note: string | null;
}

// Plain data read, not a "use server" action — field_requirements stays
// SELECT-only in this phase (its admin UI is ROADMAP Phase 3), this just
// powers the "required because…" banner on the person form.
export async function getFieldRequirements(
  supabase: SupabaseClient,
  registrationType: "main_address" | "temporary" | "casual" | "owner_agent" | null,
): Promise<RequiredFieldRule[]> {
  if (!registrationType) return [];
  const { data } = await supabase
    .from("field_requirements")
    .select("field_name, required, note")
    .eq("entity_type", "person")
    .or(`registration_type.eq.${registrationType},registration_type.is.null`);
  return (data ?? []).map((r) => ({ fieldName: r.field_name, required: r.required, note: r.note }));
}
