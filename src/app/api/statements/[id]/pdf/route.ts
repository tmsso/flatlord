import { createClient } from "@/lib/supabase/server";
import { renderStatementPdf } from "@/server/billing/render-statement-pdf";

export const runtime = "nodejs";

// Streams a statement as a bilingual PDF (ROADMAP Phase 4 — "PDF statement
// export"). One route for both roles: RLS on `statements` scopes
// visibility (owner → owned property, tenant → own tenancy), so a caller
// who may not see the statement gets a 404, not the file. Linked from the
// download button on both the admin and tenant statement-detail views.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let result;
  try {
    result = await renderStatementPdf(supabase, id);
  } catch (err) {
    console.error("statement pdf: render failed", id, err instanceof Error ? err.message : err);
    return new Response("Failed to render statement", { status: 500 });
  }
  if (!result) return new Response("Not found", { status: 404 });

  // Wrap in a File (a Blob, so an unambiguous BodyInit). render-statement-
  // pdf.ts already returns a real ArrayBuffer.
  const file = new File([result.bytes], result.fileName, { type: "application/pdf" });

  return new Response(file, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
