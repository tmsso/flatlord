"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const DeleteAttachmentSchema = z.object({
  id: z.string().uuid(),
});

// Soft delete only (CLAUDE.md §3.5 "never hard-delete; status flags") —
// sets deleted_at, never removes the row or the underlying Storage object,
// so the file stays recoverable/auditable.
export async function deleteAttachment(input: z.infer<typeof DeleteAttachmentSchema>) {
  const parsed = DeleteAttachmentSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { error } = await supabase.from("attachments").update({ deleted_at: new Date().toISOString() }).eq("id", parsed.id);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "attachment",
    entityId: parsed.id,
    actorId: personId,
    action: "delete",
  });
}
