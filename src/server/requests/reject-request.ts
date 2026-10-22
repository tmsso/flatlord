"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { notifyRequestEvent } from "@/server/notifications/notify-request-event";
import { fail, type ActionResult } from "@/lib/action-result";

const RejectRequestSchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(2000).optional(),
});

// B-41 (design/09 9 "Reject with note"): one owner action for both plain
// and field-change requests. A note lands in the thread as an ordinary
// owner message (so it stays visible next to the conversation) and is
// quoted in the tenant's rejection notification — one notification, not a
// separate "new message" one. Rejecting a field-change request touches
// nothing on the target entity, same as before.
export async function rejectRequest(input: z.infer<typeof RejectRequestSchema>): Promise<ActionResult> {
  const parsed = RejectRequestSchema.parse(input);
  const note = parsed.note || null;
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("status")
    .eq("id", parsed.id)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Request not found");
  if (request.status !== "open") return fail("requestNotOpen");

  // Message first, while the request is still open.
  if (note) {
    const { data: message, error: messageError } = await supabase
      .from("request_messages")
      .insert({ request_id: parsed.id, author_id: personId, body: note })
      .select("id")
      .single();
    if (messageError) throw new Error(messageError.message);
    await logAudit(supabase, {
      entityType: "request_message",
      entityId: message.id,
      actorId: personId,
      action: "create",
      after: { requestId: parsed.id },
    });
  }

  const update = { status: "rejected", updated_at: new Date().toISOString() };
  // Guarded on status so a withdraw racing this click can't be overwritten.
  const { data: updated, error } = await supabase
    .from("requests")
    .update(update)
    .eq("id", parsed.id)
    .eq("status", "open")
    .select("id");
  if (error) throw new Error(error.message);
  if (!updated?.length) return fail("requestNotOpen");

  await logAudit(supabase, {
    entityType: "request",
    entityId: parsed.id,
    actorId: personId,
    action: "reject",
    before: { status: "open" },
    after: { ...update, withNote: !!note },
  });

  await notifyRequestEvent({ requestId: parsed.id, event: "rejected", actorRole: "owner", note });
  return { ok: true };
}
