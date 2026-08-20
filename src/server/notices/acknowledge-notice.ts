"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { logAudit } from "@/server/audit/log";

const AcknowledgeNoticeSchema = z.object({ id: z.string().uuid() });

// Tenant-only. This UPDATE only ever sets acknowledged_at/acknowledged_by
// — RLS's tenant_acknowledge_notices policy (migration 0020) further
// restricts it to the caller's own tenancy's notice, only while
// requires_acknowledgement is true and it hasn't been acknowledged yet,
// and only to the caller's own person_id; the notices_guard_immutable()
// trigger separately rejects any attempt to change any other column in
// the same statement. Because that RLS USING clause can make a denied
// attempt a *silent* 0-row update rather than a thrown error (e.g.
// re-acknowledging an already-acknowledged notice, or a foreign tenancy's
// notice), the update chains .select("id") and throws if nothing came
// back — same silent-denial shape flagged in project memory
// flatlord_authenticated_role_grants for absent GRANTs.
export async function acknowledgeNotice(input: z.infer<typeof AcknowledgeNoticeSchema>) {
  const parsed = AcknowledgeNoticeSchema.parse(input);
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (profile.role !== "tenant") throw new Error("Not authorized");

  const { data, error } = await supabase
    .from("notices")
    .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: profile.personId })
    .eq("id", parsed.id)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Notice not found, already acknowledged, or acknowledgement not required");

  await logAudit(supabase, {
    entityType: "notice",
    entityId: parsed.id,
    actorId: profile.personId,
    action: "acknowledge",
    after: { acknowledgedBy: profile.personId },
  });
}
