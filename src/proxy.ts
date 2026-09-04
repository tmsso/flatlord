import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // api/health and api/cron are excluded because they must be reachable
    // unauthenticated (cron targets with no session — see
    // src/app/api/health/route.ts and src/app/api/cron/daily-reminders/
    // route.ts, which does its own CRON_SECRET bearer-token check instead).
    "/((?!_next/static|_next/image|favicon.ico|api/health|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
