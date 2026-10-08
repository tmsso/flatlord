import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { classifyRoute, isAllowedForRole } from "../../src/lib/auth/route-access";

const APP_DIR = join(__dirname, "../../src/app");

/** Every page.tsx / route.ts under src/app, as a URL path ("[id]" → "x"). */
function appRoutes(dir = APP_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...appRoutes(full));
    } else if (entry === "page.tsx" || entry === "route.ts") {
      const segments = relative(APP_DIR, dir)
        .split(sep)
        .filter((s) => s && !/^\(.*\)$/.test(s)) // route groups don't appear in URLs
        .map((s) => (/^\[.*\]$/.test(s) ? "x" : s));
      out.push(`/${segments.join("/")}`);
    }
  }
  return out;
}

describe("route-access (B-25 default-deny)", () => {
  const routes = appRoutes();

  it("finds the app's routes", () => {
    expect(routes).toContain("/dashboard");
    expect(routes).toContain("/home/statements/x");
  });

  it("classifies every page and route handler (except the root redirect)", () => {
    // A new route added without a classification fails here — add it to
    // src/lib/auth/route-access.ts deliberately.
    const unclassified = routes.filter((r) => r !== "/" && classifyRoute(r) === "unclassified");
    expect(unclassified).toEqual([]);
  });

  it("keeps a tenant off every owner route, including their own tenancy page", () => {
    for (const r of routes.filter((r) => classifyRoute(r) === "owner")) {
      expect(isAllowedForRole(r, "tenant"), r).toBe(false);
    }
    expect(isAllowedForRole("/tenancies/some-id", "tenant")).toBe(false);
  });

  it("keeps the owner off tenant routes", () => {
    for (const r of routes.filter((r) => classifyRoute(r) === "tenant")) {
      expect(isAllowedForRole(r, "owner"), r).toBe(false);
    }
  });

  it("lets both roles use shared and public paths", () => {
    for (const role of ["owner", "tenant"] as const) {
      expect(isAllowedForRole("/api/statements/x/pdf", role)).toBe(true);
      expect(isAllowedForRole("/auth/callback", role)).toBe(true);
    }
  });

  it("matches per segment, and denies unknown paths", () => {
    expect(classifyRoute("/homepage")).toBe("unclassified");
    expect(classifyRoute("/settingsx")).toBe("unclassified");
    expect(isAllowedForRole("/something-new", "owner")).toBe(false);
    expect(isAllowedForRole("/something-new", "tenant")).toBe(false);
  });
});
