import { describe, expect, it } from "vitest";
import { roleFromClaims } from "../../src/lib/auth/claims-role";

describe("roleFromClaims (B-03)", () => {
  it("reads the hook's user_role claim", () => {
    expect(roleFromClaims({ sub: "u", user_role: "owner" })).toBe("owner");
    expect(roleFromClaims({ sub: "u", user_role: "tenant" })).toBe("tenant");
  });

  it("falls back (null) when the claim is missing or unexpected", () => {
    expect(roleFromClaims({ sub: "u" })).toBeNull();
    expect(roleFromClaims({ sub: "u", role: "authenticated" })).toBeNull(); // Postgres role, not ours
    expect(roleFromClaims({ sub: "u", user_role: "admin" })).toBeNull();
    expect(roleFromClaims(null)).toBeNull();
  });
});
