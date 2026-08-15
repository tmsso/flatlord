"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { storeAttachment } from "@/lib/attachments/store-attachment";

const UploadAttachmentSchema = z.object({
  entityType: z.enum(["tenancy", "person", "inventory_item"]),
  entityId: z.string().uuid(),
  note: z.string().trim().min(1).nullable().optional(),
});

// Admin-only upload path (ROADMAP Phase 2 item 4) — the one exception is
// the tenant reconfirmation-photo flow (item 6), which calls
// storeAttachment() directly with its own tenant-role auth check rather
// than going through this owner-gated action. See
// src/server/inventory/submit-reconfirmation-response.ts.
export async function uploadAttachment(input: z.infer<typeof UploadAttachmentSchema>, file: File) {
  const parsed = UploadAttachmentSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const attachment = await storeAttachment(
    supabase,
    { entityType: parsed.entityType, entityId: parsed.entityId, note: parsed.note, uploadedBy: personId },
    file,
  );

  await logAudit(supabase, {
    entityType: "attachment",
    entityId: attachment.id,
    actorId: personId,
    action: "create",
    after: { entityType: parsed.entityType, entityId: parsed.entityId, fileName: file.name },
  });

  return attachment;
}
