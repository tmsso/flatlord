"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { logAudit } from "@/server/audit/log";
import { notifyRequestEvent } from "@/server/notifications/notify-request-event";

const WithdrawRequestSchema = z.object({ id: z.string().uuid() });

// Tenant-only (RLS's tenant_withdraw_requests, migration 0019, further
// restricts this to their own OPEN requests) — resolve/reject stay
// admin-only transitions via update-request.ts.
export async function withdrawRequest(input: z.infer<typeof WithdrawRequestSchema>) {
  const parsed = WithdrawRequestSchema.parse(input);
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (profile.role !== "tenant") throw new Error("Not authorized");

  const { error } = await supabase
    .from("requests")
    .update({ status: "withdrawn", updated_at: new Date().toISOString() })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "request",
    entityId: parsed.id,
    actorId: profile.personId,
    action: "update",
    after: { status: "withdrawn" },
  });

  await notifyRequestEvent({ requestId: parsed.id, event: "withdrawn", actorRole: "tenant" });
}
