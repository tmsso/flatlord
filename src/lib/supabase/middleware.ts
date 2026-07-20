import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on every request and enforces the
 * invite-only gate + role-based routing:
 *  - No session -> only /login (and its assets/API) is reachable.
 *  - Session but no `profiles` row -> not an invited account; sign out
 *    and bounce to /login (Supabase creates an auth.users row on any
 *    OAuth/magic-link completion, but handle_new_user only creates a
 *    profile when a live invite matched).
 *  - owner -> /dashboard, tenant -> /home (root `/` and the wrong shell
 *    redirect to the correct one).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isLoginPath = pathname.startsWith("/login");
  const isAuthCallback = pathname.startsWith("/auth/callback");

  if (!user) {
    if (!isLoginPath && !isAuthCallback) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "not_invited");
    return NextResponse.redirect(url);
  }

  const homeForRole = profile.role === "owner" ? "/dashboard" : "/home";

  if (isLoginPath || pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole;
    return NextResponse.redirect(url);
  }

  // /settings (invite management) is owner-only content, but wasn't in
  // this list until now — a pre-existing gap (any authenticated user could
  // reach it), closed here alongside adding /statements for the new
  // statement-lifecycle UI. /home/statements is already covered by the
  // /home prefix below, no separate entry needed. /api/admin covers the
  // backup export route — it also has its own in-handler role check
  // (defense in depth for the single highest-value target in the app).
  const isAdminPath =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/statements") ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/api/admin");
  const isTenantPath = pathname.startsWith("/home");
  if (
    (isAdminPath && profile.role !== "owner") ||
    (isTenantPath && profile.role !== "tenant")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
