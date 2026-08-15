"use server";

import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { extractPdfText } from "@/lib/contracts/extract-pdf-text";
import { proposeContractTerms, type ProposedContractTerms } from "@/lib/contracts/propose-contract-terms";

export interface ParseContractResult {
  hasText: boolean;
  proposals: ProposedContractTerms;
}

// Read-only preview step (ROADMAP Phase 2, contract intake parsing): runs
// before createContract, on the raw uploaded file, so the admin sees
// suggested values to accept/edit/ignore per field *before* anything is
// written — createContract itself is unchanged, still the only place a
// contract row gets created. No audit log here since nothing mutates.
//
// `hasText: false` covers both "no text layer" (scanned PDF — OCR needs
// OpenRouter, not wired up, see extract-pdf-text.ts) and "text layer
// present but no terms matched the heuristics" would still report
// hasText: true with empty proposals, since those are different admin-
// facing situations: one means "enter everything manually, nothing to
// read from", the other means "the document has text, our patterns just
// didn't catch anything in it".
export async function parseContract(file: File): Promise<ParseContractResult> {
  const supabase = await createClient();
  await requireOwnerPersonId(supabase);

  const bytes = new Uint8Array(await file.arrayBuffer());
  const text = await extractPdfText(bytes);

  return {
    hasText: text != null,
    proposals: proposeContractTerms(text),
  };
}
