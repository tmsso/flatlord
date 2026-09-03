"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { notifyRequestEvent } from "@/server/notifications/notify-request-event";
import { isPersonEditableField } from "@/lib/field-editability/person-fields";

const ChangePayloadSchema = z.object({
  entityType: z.literal("person"),
  entityId: z.string().uuid(),
  fieldName: z.string().refine(isPersonEditableField, "Unknown field"),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
});

// The only action that actually applies an approval_required change —
// rejecting one is just updateRequest({status: 'rejected'}), which
// correctly touches nothing on the target entity. This one deliberately
// does NOT reuse updateRequest's generic 'resolved' transition: a plain
// resolve on a field-change request would mark it done without ever
// writing the value, which is exactly the silent-inconsistency risk this
// separate action exists to avoid (see the admin UI, which renders
// Approve/Reject instead of Resolve/Reject whenever changePayload is
// present, so the generic path is never reachable for these).
export async function approveFieldChange(requestId: string) {
  z.string().uuid().parse(requestId);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: request, error: requestError } = await supabase
    .from("requests")
    .select("id, status, change_payload")
    .eq("id", requestId)
    .maybeSingle();
  if (requestError) throw new Error(requestError.message);
  if (!request) throw new Error("Request not found");
  if (request.status !== "open") throw new Error("Request is not open");

  const payload = ChangePayloadSchema.parse(request.change_payload);

  // payload.entityType is a z.literal("person") for now (the only
  // entityType this feature supports) — hardcoding the table name here
  // rather than deriving it avoids ever building a Supabase `.from()` call
  // from unvalidated jsonb content.
  const { error: updateError } = await supabase
    .from("persons")
    .update({ [payload.fieldName]: payload.newValue })
    .eq("id", payload.entityId);
  if (updateError) throw new Error(updateError.message);

  await logAudit(supabase, {
    entityType: payload.entityType,
    entityId: payload.entityId,
    actorId: personId,
    action: "field_edit_approved",
    before: { [payload.fieldName]: payload.oldValue },
    after: { [payload.fieldName]: payload.newValue },
  });

  const { error: resolveError } = await supabase
    .from("requests")
    .update({ status: "resolved", updated_at: new Date().toISOString() })
    .eq("id", requestId);
  if (resolveError) throw new Error(resolveError.message);

  await logAudit(supabase, {
    entityType: "request",
    entityId: requestId,
    actorId: personId,
    action: "approve",
    after: { status: "resolved" },
  });

  await notifyRequestEvent({ requestId, event: "resolved", actorRole: "owner" });
}
