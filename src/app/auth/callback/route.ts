import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Exchanges the OAuth/magic-link code for a session. Role-based redirect
// (and the invite-gate sign-out) happens in middleware on the next
// request, so this always redirects to `/` and lets it decide.
//
// Redirects use a bare relative path in the Location header, deliberately
// not NextResponse.redirect(url) with any server-computed origin (neither
// `new URL(request.url).origin` nor `request.nextUrl.clone()`). In this
// Next.js/Turbopack dev server, request-derived URLs always self-report as
// "localhost:<port>" — the server's own listen address — regardless of the
// actual incoming Host header, `allowedDevOrigins`, or which interface the
// connection came in on (confirmed directly: curl with an explicit
// `Host: intermouse:3001` header, over the real Tailscale IP, still got
// back a `localhost:3001` Location). That silently broke this route for
// every non-localhost client (e.g. over Tailscale) — no visible error, it
// just redirected the browser to a "localhost" that only exists on the
// dev-server machine. A relative Location header sidesteps the problem
// entirely: browsers resolve it against whatever host they actually used,
// which is always correct, dev or prod.
function redirectTo(path: string) {
  return new Response(null, { status: 307, headers: { Location: path } });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirectTo("/");
  }

  return redirectTo("/login?error=auth_failed");
}
