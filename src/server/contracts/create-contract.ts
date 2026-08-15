"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { extractPdfText } from "@/lib/contracts/extract-pdf-text";

const CreateContractSchema = z.object({
  tenancyId: z.string().uuid(),
  predecessorContractId: z.string().uuid().nullable().optional(),
  termStart: z.string().min(1, "termStartRequired"),
  termEnd: z.string().nullable().optional(),
  noticeDays: z.number().int().positive(),
  depositAmount: z.number().int().nonnegative().nullable().optional(),
  depositCurrency: z.string().length(3).default("HUF"),
  signedAt: z.string().nullable().optional(),
});

// React Server Actions accept File objects directly as arguments (RSC
// serialization, no FormData needed) — the caller passes a plain <input
// type="file"> File. Uploaded here (not client-side, unlike the meter-
// photo flow) because text extraction needs the bytes server-side anyway,
// and a single request is simpler than upload-then-notify for a document
// this infrequent.
export async function createContract(
  input: z.infer<typeof CreateContractSchema>,
  file: File,
) {
  const parsed = CreateContractSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  // version = predecessor's version + 1, or 1 for the first version.
  // contracts_tenancy_version_unique (migration 0015) is the actual
  // guarantee against a race producing a duplicate version number.
  let version = 1;
  if (parsed.predecessorContractId) {
    const { data: predecessor, error: predecessorError } = await supabase
      .from("contracts")
      .select("version, tenancy_id")
      .eq("id", parsed.predecessorContractId)
      .single();
    if (predecessorError) throw new Error(predecessorError.message);
    if (predecessor.tenancy_id !== parsed.tenancyId) {
      throw new Error("predecessorTenancyMismatch");
    }
    version = predecessor.version + 1;
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  // unpdf's underlying PDF.js takes ownership of (detaches) the typed
  // array it's given while parsing — passing `bytes` itself left it
  // zeroed out afterwards, which silently produced a 0-byte upload below
  // (confirmed by downloading the "uploaded" file and checking its size,
  // not by reading the extraction code — nothing here throws or warns).
  // A defensive copy keeps `bytes` intact for the upload.
  const documentText = await extractPdfText(bytes.slice());

  const { data: contract, error: insertError } = await supabase
    .from("contracts")
    .insert({
      tenancy_id: parsed.tenancyId,
      predecessor_contract_id: parsed.predecessorContractId ?? null,
      version,
      status: "draft",
      term_start: parsed.termStart,
      term_end: parsed.termEnd ?? null,
      notice_days: parsed.noticeDays,
      deposit_amount: parsed.depositAmount ?? null,
      deposit_currency: parsed.depositCurrency,
      signed_at: parsed.signedAt ?? null,
      document_text: documentText,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  // storage-js's upload() silently produces a 0-byte object when given a
  // raw Uint8Array server-side (confirmed the hard way: insert + text
  // extraction both succeeded, the uploaded PDF was 0 bytes) — Node's
  // Buffer is the documented/working shape for server-side uploads.
  const documentPath = `${parsed.tenancyId}/${contract.id}.pdf`;
  const { error: uploadError } = await supabase.storage.from("contracts").upload(documentPath, Buffer.from(bytes), {
    contentType: "application/pdf",
  });
  if (uploadError) throw new Error(uploadError.message);

  const { error: updateError } = await supabase
    .from("contracts")
    .update({ document_path: documentPath })
    .eq("id", contract.id);
  if (updateError) throw new Error(updateError.message);

  await logAudit(supabase, {
    entityType: "contract",
    entityId: contract.id,
    actorId: personId,
    action: "create",
    after: { tenancyId: parsed.tenancyId, version, status: "draft" },
  });

  return { id: contract.id as string };
}
