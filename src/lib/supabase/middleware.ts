import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAllowedForRole } from "@/lib/auth/route-access";
import { roleFromClaims } from "@/lib/auth/claims-role";

/**
 * Refreshes the Supabase session on every request and enforces the
 * invite-only gate + role-based routing:
 *  - No session -> only /login (and its assets/API) is reachable.
 *  - Session but no `profiles` row -> not an invited account; sign out
 *    and bounce to /login (Supabase creates an auth.users row on any
 *    OAuth/magic-link completion, but handle_new_user only creates a
 *    profile when a live invite matched).
 *  - Tenant whose every tenancy has ended (B-43 offboarding) -> sign out
 *    and bounce to /login.
 *  - owner -> /dashboard, tenant -> /home (root `/` and the wrong shell
 *    redirect to the correct one).
 *
 * B-03: the session is checked with getClaims(), which verifies the JWT
 * locally once the project signs with asymmetric keys (JWKS cached for
 * 10 min per server instance) and falls back to getUser()'s Auth round
 * trip while it still uses the legacy shared secret. The role comes from
 * the access-token hook's `user_role` claim (0037); without it we query
 * profiles as before. Trade-off (D-47): a deleted profile keeps its role
 * until the access token expires (≤ 1 h). The tenant lockout below stays
 * a live query so offboarding takes effect immediately.
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

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  const { pathname } = request.nextUrl;
  const isLoginPath = pathname.startsWith("/login");
  const isAuthCallback = pathname.startsWith("/auth/callback");

  if (!claims?.sub) {
    if (!isLoginPath && !isAuthCallback) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  let profile: { role: "owner" | "tenant" } | null = null;
  const claimedRole = roleFromClaims(claims);
  if (claimedRole) {
    profile = { role: claimedRole };
  } else {
    const { data } = await supabase.from("profiles").select("role").eq("id", claims.sub).maybeSingle();
    profile = data;
  }

  if (!profile) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("error", "not_invited");
    // Carry the cleared session cookies onto the redirect. Required since
    // B-03: getClaims() verifies the JWT locally, so a token whose session
    // was just revoked still verifies — without the cleared cookies /login
    // would sign out and redirect again, forever.
    const redirect = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  if (profile.role === "tenant") {
    // B-43: an offboarded tenant loses access. Positive evidence only — at
    // least one tenancy, all ended/terminated (RLS returns just their own).
    // A failed query or a tenant with no tenancy yet lets the request
    // through, so a database blip can't sign every tenant out. One extra
    // round-trip for tenants; folds into B-03's no-network proxy later.
    const { data: tenancies, error: tenancyError } = await supabase.from("tenancies").select("status");
    const allEnded =
      !tenancyError && !!tenancies?.length && tenancies.every((t) => t.status === "ended" || t.status === "terminated");
    if (allEnded) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      url.searchParams.set("error", "tenancy_ended");
      const redirect = NextResponse.redirect(url);
      // Carry the cleared session cookies onto the redirect.
      for (const cookie of supabaseResponse.cookies.getAll()) redirect.cookies.set(cookie);
      return redirect;
    }
  }

  const homeForRole = profile.role === "owner" ? "/dashboard" : "/home";

  if (isLoginPath || pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole;
    return NextResponse.redirect(url);
  }

  // Default-deny: a path must be explicitly classified for this role in
  // route-access.ts, otherwise it bounces to the role's home (B-25).
  // /api/admin's backup route keeps its own in-handler role check as
  // defence in depth.
  if (!isAllowedForRole(pathname, profile.role === "owner" ? "owner" : "tenant")) {
    const url = request.nextUrl.clone();
    url.pathname = homeForRole;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
