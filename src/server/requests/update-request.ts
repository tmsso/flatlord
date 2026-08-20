"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { notifyRequestEvent } from "@/server/notifications/notify-request-event";

const UpdateRequestSchema = z.object({
  id: z.string().uuid(),
  // resolve/reject are the only owner-driven status transitions this
  // action allows — withdraw is tenant-only (withdraw-request.ts), and
  // there's deliberately no way back to 'open' (CLAUDE.md §3.5: never
  // hard-delete/un-resolve, a corrected decision is a new action, not a
  // status flip-flop).
  status: z.enum(["resolved", "rejected"]).optional(),
  externalCaseRef: z.string().trim().min(1).nullable().optional(),
  appointmentDate: z.string().min(1).nullable().optional(),
});

export async function updateRequest(input: z.infer<typeof UpdateRequestSchema>) {
  const parsed = UpdateRequestSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: before } = await supabase
    .from("requests")
    .select("status, external_case_ref, appointment_date")
    .eq("id", parsed.id)
    .maybeSingle();

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.status) update.status = parsed.status;
  if (parsed.externalCaseRef !== undefined) update.external_case_ref = parsed.externalCaseRef ?? null;
  if (parsed.appointmentDate !== undefined) update.appointment_date = parsed.appointmentDate ?? null;

  const { error } = await supabase.from("requests").update(update).eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "request",
    entityId: parsed.id,
    actorId: personId,
    action: "update",
    before: before ?? null,
    after: update,
  });

  if (parsed.status) {
    await notifyRequestEvent({ requestId: parsed.id, event: parsed.status, actorRole: "owner" });
  }
}
