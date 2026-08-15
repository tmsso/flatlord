import { extractText, getDocumentProxy } from "unpdf";

// Best-effort digital-PDF text-layer extraction only (ROADMAP Phase 2's
// contract module bullet). A scanned contract has no text layer — unpdf
// returns an empty/near-empty string for it, which this treats as "no
// text", not an error. OCR-for-scans is the *next* Phase 2 item (contract
// intake parsing), gated on OPENROUTER_API_KEY, which is unset as of this
// writing — that path is intentionally not built here.
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  try {
    const pdf = await getDocumentProxy(bytes);
    const { text } = await extractText(pdf, { mergePages: true });
    const trimmed = text.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    // Malformed/unreadable PDF shouldn't block the upload — the document
    // itself still gets stored, it just won't be full-text searchable.
    return null;
  }
}
