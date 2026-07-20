import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { buildBackupArchive } from "@/lib/backup/build-backup-archive";

export const runtime = "nodejs";

// Highest-value target in the app — returns every row in every table.
// Middleware already gates /api/admin to owners; this in-handler check is
// deliberate defense in depth, not redundancy (CLAUDE.md §6: RLS/gating is
// the last line of defence, not the only one).
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  let profile;
  try {
    profile = await getCurrentProfile(supabase);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  if (profile.role !== "owner") {
    return new Response("Forbidden", { status: 403 });
  }

  const dataOnly = request.nextUrl.searchParams.get("dataOnly") === "1";

  let archive: Buffer;
  try {
    archive = await buildBackupArchive({ dataOnly });
  } catch (err) {
    console.error("backup export failed", err);
    return new Response("Backup export failed", { status: 500 });
  }

  const filename = `flatlord-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(new Uint8Array(archive), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(archive.length),
    },
  });
}
