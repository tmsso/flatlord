"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// RLS (self_update_notifications, migration 0022) is the real gate — this
// action's own job is just constraining which column gets written, since
// the policy itself can't restrict that.
export async function markNotificationRead(id: string) {
  z.string().uuid().parse(id);
  const supabase = await createClient();
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
}
