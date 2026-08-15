import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const ATTACHMENT_MAX_SIZE_BYTES = 26214400;
export const ATTACHMENT_ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/webp",
]);

// Storage path segments are read back by RLS via storage.foldername() —
// keep the file-name segment free of "/" and anything else that would
// shift array indices.
function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

// Shared insert-then-upload-then-update idiom, factored out of
// upload-attachment.ts (ROADMAP Phase 2 item 4) so the tenant-facing
// reconfirmation-photo path (item 6, src/server/inventory/submit-
// reconfirmation-response.ts) doesn't duplicate it — that caller isn't an
// owner, so it can't reuse uploadAttachment() directly (that action hard-
// requires requireOwnerPersonId). Callers own their own auth check before
// calling this.
export async function storeAttachment(
  supabase: SupabaseClient,
  input: { entityType: string; entityId: string; note?: string | null; uploadedBy: string },
  file: File,
): Promise<{ id: string }> {
  if (!ATTACHMENT_ALLOWED_MIME_TYPES.has(file.type)) throw new Error("unsupportedFileType");
  if (file.size > ATTACHMENT_MAX_SIZE_BYTES) throw new Error("fileTooLarge");

  const { data: attachment, error: insertError } = await supabase
    .from("attachments")
    .insert({
      entity_type: input.entityType,
      entity_id: input.entityId,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      note: input.note ?? null,
      uploaded_by: input.uploadedBy,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  // storage-js's upload() silently produces a 0-byte object when given a
  // raw Uint8Array server-side — Buffer.from() is the working shape here
  // (same gotcha documented in create-contract.ts).
  const bytes = new Uint8Array(await file.arrayBuffer());
  const storagePath = `${input.entityType}/${input.entityId}/${attachment.id}-${sanitizeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage.from("attachments").upload(storagePath, Buffer.from(bytes), {
    contentType: file.type,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabase.from("attachments").update({ storage_path: storagePath }).eq("id", attachment.id);
  if (updateError) throw new Error(updateError.message);

  return { id: attachment.id as string };
}
