import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";

// Public, unauthenticated by design — a cron target needs to reach this
// without a session, so it's excluded from the auth-gating proxy matcher
// (see proxy.ts). Only ever returns ok/error, no data, so there's nothing
// sensitive to expose to an anonymous caller.
export async function GET() {
  try {
    const supabase = createServiceRoleClient();
    const { error } = await supabase.from("properties").select("id").limit(1);
    if (error) throw error;
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    console.error("health check: database unreachable", err);
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
