"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { logAudit } from "@/server/audit/log";
import { storeAttachment } from "@/lib/attachments/store-attachment";
import { notifyRequestEvent } from "@/server/notifications/notify-request-event";

const AddRequestMessageSchema = z.object({
  requestId: z.string().uuid(),
  body: z.string().trim().min(1),
});

// Either side can post into the thread (CLAUDE.md §3.7: "threaded replies
// /documents both ways"). RLS (owner_insert_request_messages /
// tenant_insert_request_messages, migration 0019) already scopes this to
// a request the caller can see — this action just resolves who's calling
// so notifyRequestEvent knows which direction to notify.
export async function addRequestMessage(input: z.infer<typeof AddRequestMessageSchema>, file?: File) {
  const parsed = AddRequestMessageSchema.parse(input);
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: message, error } = await supabase
    .from("request_messages")
    .insert({ request_id: parsed.requestId, author_id: profile.personId, body: parsed.body })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (file) {
    await storeAttachment(
      supabase,
      { entityType: "request", entityId: parsed.requestId, uploadedBy: profile.personId },
      file,
    );
  }

  await logAudit(supabase, {
    entityType: "request_message",
    entityId: message.id,
    actorId: profile.personId,
    action: "create",
    after: { requestId: parsed.requestId },
  });

  await notifyRequestEvent({ requestId: parsed.requestId, event: "message", actorRole: profile.role });

  return { id: message.id as string };
}
