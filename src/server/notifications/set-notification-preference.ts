"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/notification-categories";

const SetNotificationPreferenceSchema = z.object({
  category: z.enum(NOTIFICATION_CATEGORIES),
  email: z.boolean(),
});

// Read-then-write merge, not a single UPDATE: supabase-js has no partial
// jsonb-merge update, and the column-level GRANT (migration 0022) only
// permits writing notification_prefs anyway — merging in JS keeps every
// other category's setting untouched.
export async function setNotificationPreference(input: z.infer<typeof SetNotificationPreferenceSchema>) {
  const parsed = SetNotificationPreferenceSchema.parse(input);
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: current, error: selectError } = await supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("id", profile.userId)
    .single();
  if (selectError) throw new Error(selectError.message);

  const prefs = (current.notification_prefs ?? {}) as Record<string, { email?: boolean }>;
  const next = { ...prefs, [parsed.category]: { email: parsed.email } };

  const { error: updateError } = await supabase.from("profiles").update({ notification_prefs: next }).eq("id", profile.userId);
  if (updateError) throw new Error(updateError.message);
}
