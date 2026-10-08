/**
 * Default-deny route classification for the proxy (B-25).
 *
 * Every path an authenticated user can reach must be listed here under
 * exactly one class; anything unmatched is "unclassified" and the proxy
 * redirects it to the user's home. The previous allow-list named only a
 * few admin prefixes, so new admin sections (/properties, /tenancies, …)
 * were silently reachable by a tenant session. A unit test
 * (tests/unit/route-access.test.ts) walks src/app and fails if a page or
 * route handler isn't classified, so a new route fails closed in CI
 * rather than open in prod.
 *
 * Matching is per path segment: "/home" covers "/home" and "/home/…",
 * never "/homepage".
 */

export type RouteClass = "public" | "owner" | "tenant" | "shared" | "unclassified";
export type Role = "owner" | "tenant";

// Reachable without a session (the proxy matcher also skips api/health
// and api/cron entirely; they authenticate themselves).
const PUBLIC_PREFIXES = ["/login", "/auth/callback", "/api/health", "/api/cron"];

const OWNER_PREFIXES = [
  "/dashboard",
  "/statements",
  "/meters",
  "/properties",
  "/tenancies",
  "/persons",
  "/requests",
  "/notices",
  "/settings",
  "/api/admin",
];

const TENANT_PREFIXES = ["/home"];

// Both roles; the handler's data access is RLS-scoped to the caller.
// /api/statements/[id]/pdf serves the owner's statement page and the
// tenant's statement history alike. /_next covers framework-internal
// requests (dev HMR, data fetches) that the matcher doesn't exclude.
const SHARED_PREFIXES = ["/api/statements", "/_next"];

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function classifyRoute(pathname: string): RouteClass {
  if (PUBLIC_PREFIXES.some((p) => matches(pathname, p))) return "public";
  if (OWNER_PREFIXES.some((p) => matches(pathname, p))) return "owner";
  if (TENANT_PREFIXES.some((p) => matches(pathname, p))) return "tenant";
  if (SHARED_PREFIXES.some((p) => matches(pathname, p))) return "shared";
  return "unclassified";
}

/** Whether an authenticated user with `role` may stay on `pathname`. */
export function isAllowedForRole(pathname: string, role: Role): boolean {
  const cls = classifyRoute(pathname);
  if (cls === "public" || cls === "shared") return true;
  return cls === role;
}
