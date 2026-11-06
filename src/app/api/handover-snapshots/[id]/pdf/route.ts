import { createClient } from "@/lib/supabase/server";
import { renderHandoverPdf } from "@/server/handover/render-handover-pdf";

export const runtime = "nodejs";
// Hobby's default function timeout (10s) can be tight for @react-pdf
// rendering with embedded fonts (BACKLOG.md B-18) — 60s is Hobby's max.
export const maxDuration = 60;

// B-13: streams a handover snapshot as a bilingual PDF. One route for both
// roles; RLS on handover_snapshots scopes visibility (D-49), so a caller
// who may not see the snapshot gets a 404.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  let result;
  try {
    result = await renderHandoverPdf(supabase, id);
  } catch (err) {
    console.error("handover pdf: render failed", id, err instanceof Error ? err.message : err);
    return new Response("Failed to render handover protocol", { status: 500 });
  }
  if (!result) return new Response("Not found", { status: 404 });

  // Wrap in a File (a Blob, so an unambiguous BodyInit). render-handover-
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
