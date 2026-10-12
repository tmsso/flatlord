"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { OPTIONAL_MODULES } from "@/lib/modules";

const SetModuleEnabledSchema = z.object({
  module: z.enum(OPTIONAL_MODULES),
  enabled: z.boolean(),
});

// Off hides, never deletes (D-33): only the switch changes, the module's
// data stays untouched.
export async function setModuleEnabled(input: z.infer<typeof SetModuleEnabledSchema>) {
  const parsed = SetModuleEnabledSchema.parse(input);
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (profile.role !== "owner") throw new Error("Only an owner can switch modules");

  // Raw array, not the filtered ModuleSet: values the UI doesn't offer yet
  // (e.g. 'taxation') must survive a toggle of another module.
  const { data: row, error: readError } = await supabase
    .from("profiles")
    .select("enabled_modules")
    .eq("id", profile.userId)
    .single();
  if (readError) throw new Error(readError.message);
  const next = new Set<string>((row.enabled_modules as string[]) ?? []);
  if (parsed.enabled) next.add(parsed.module);
  else next.delete(parsed.module);

  // self_update_profiles (0022) scopes this to the caller's own row.
  const { error } = await supabase
    .from("profiles")
    .update({ enabled_modules: [...next].sort() })
    .eq("id", profile.userId);
  if (error) throw new Error(error.message);
}
