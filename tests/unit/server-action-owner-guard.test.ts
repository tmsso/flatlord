import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { requireOwnerPersonId } from "../../src/server/auth/require-owner";

const ROOT = join(__dirname, "../..");

// Server actions that are not owner-only: tenant-facing or two-way flows
// (requests, notice acknowledgement, field edits, reconfirmation — these
// scope by role/tenancy themselves) plus per-user settings and sign-in.
// Every other "use server" module must check the owner role in code — RLS stays the real enforcement, this is the
// CLAUDE.md §6 "not the only line of defence" layer. A new action that
// isn't listed here and doesn't check fails this test.
const NON_OWNER_ACTIONS = new Set([
  "src/server/auth/send-magic-link.ts",
  "src/server/auth/sign-out.ts",
  "src/server/locale/set-locale.ts",
  "src/server/notifications/mark-notification-read.ts",
  "src/server/notifications/set-notification-preference.ts",
  "src/server/persons/get-required-fields.ts",
  "src/server/billing/submit-meter-reading.ts",
  "src/server/field-editability/submit-field-edit.ts",
  "src/server/inventory/submit-reconfirmation-response.ts",
  "src/server/notices/acknowledge-notice.ts",
  "src/server/requests/add-request-message.ts",
  "src/server/requests/create-request.ts",
  "src/server/requests/withdraw-request.ts",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry) ? [full] : [];
  });
}

describe("server action owner guard", () => {
  const actions = [...sourceFiles(join(ROOT, "src/server")), ...sourceFiles(join(ROOT, "src/app"))]
    .filter((f) => /^\s*["']use server["']/.test(readFileSync(f, "utf8")))
    .map((f) => relative(ROOT, f));

  it("finds the server actions", () => {
    expect(actions.length).toBeGreaterThan(20);
  });

  it("every action is either listed as non-owner or checks the owner role", () => {
    const unguarded = actions.filter((f) => {
      if (NON_OWNER_ACTIONS.has(f)) return false;
      const src = readFileSync(join(ROOT, f), "utf8");
      return !src.includes("requireOwnerPersonId(") && !/profile\??\.role\s*!==\s*["']owner["']/.test(src);
    });
    expect(unguarded).toEqual([]);
  });
});

// Minimal stand-in for the two calls requireOwnerPersonId makes.
function fakeClient(user: { id: string } | null, profile: { person_id: string | null; role: string } | null) {
  return {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
  } as unknown as Parameters<typeof requireOwnerPersonId>[0];
}

describe("requireOwnerPersonId", () => {
  it("rejects a tenant session", async () => {
    await expect(requireOwnerPersonId(fakeClient({ id: "u1" }, { person_id: "p1", role: "tenant" }))).rejects.toThrow(
      "Not authorized",
    );
  });

  it("rejects an anonymous caller", async () => {
    await expect(requireOwnerPersonId(fakeClient(null, null))).rejects.toThrow("Not authenticated");
  });

  it("returns the owner's ids", async () => {
    await expect(requireOwnerPersonId(fakeClient({ id: "u1" }, { person_id: "p1", role: "owner" }))).resolves.toEqual({
      userId: "u1",
      personId: "p1",
    });
  });
});
