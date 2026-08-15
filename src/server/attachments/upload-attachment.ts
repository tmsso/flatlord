"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const UploadAttachmentSchema = z.object({
  entityType: z.enum(["tenancy", "person"]),
  entityId: z.string().uuid(),
  note: z.string().trim().min(1).nullable().optional(),
});

// Mirrors the `attachments` Storage bucket's own limits (migration 0017)
// so a rejected upload fails fast here instead of round-tripping to
// Storage first.
const MAX_SIZE_BYTES = 26214400;
const ALLOWED_MIME_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp"]);

// Storage path segments are read back by RLS via storage.foldername() —
// keep the file-name segment free of "/" and anything else that would
// shift array indices.
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Same two-step insert-then-upload-then-update idiom as createContract
// (src/server/contracts/create-contract.ts): the row is inserted first to
// get its id, the id becomes part of the storage path, then the path is
// written back.
export async function uploadAttachment(input: z.infer<typeof UploadAttachmentSchema>, file: File) {
  const parsed = UploadAttachmentSchema.parse(input);
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error("unsupportedFileType");
  if (file.size > MAX_SIZE_BYTES) throw new Error("fileTooLarge");

  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: attachment, error: insertError } = await supabase
    .from("attachments")
    .insert({
      entity_type: parsed.entityType,
      entity_id: parsed.entityId,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      note: parsed.note ?? null,
      uploaded_by: personId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  // storage-js's upload() silently produces a 0-byte object when given a
  // raw Uint8Array server-side — Buffer.from() is the working shape here
  // (same gotcha documented in create-contract.ts).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const storagePath = `${parsed.entityType}/${parsed.entityId}/${attachment.id}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("attachments").upload(storagePath, Buffer.from(bytes), {
    contentType: file.type,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabase
    .from("attachments")
    .update({ storage_path: storagePath })
    .eq("id", attachment.id);
  if (updateError) throw new Error(updateError.message);

  await logAudit(supabase, {
    entityType: "attachment",
    entityId: attachment.id,
    actorId: personId,
    action: "create",
    after: { entityType: parsed.entityType, entityId: parsed.entityId, fileName: file.name },
  });

  return { id: attachment.id as string };
}
