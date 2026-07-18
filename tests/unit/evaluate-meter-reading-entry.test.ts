import { describe, expect, it } from "vitest";
import { evaluateMeterReadingEntry } from "../../src/lib/billing/evaluate-meter-reading-entry";

// DB-free, no `postgres` import — same pure-function pattern as
// compute-statement.test.ts.

describe("evaluateMeterReadingEntry", () => {
  it("allows an entry equal to or greater than the previous value", () => {
    expect(
      evaluateMeterReadingEntry({ enteredValue: 100, previousValue: 100, callerRole: "tenant", override: false }),
    ).toEqual({ allowed: true });
    expect(
      evaluateMeterReadingEntry({ enteredValue: 150, previousValue: 100, callerRole: "tenant", override: false }),
    ).toEqual({ allowed: true });
  });

  it("rejects a tenant's decrease unconditionally, even if override is (incorrectly) passed true", () => {
    const withoutOverride = evaluateMeterReadingEntry({
      enteredValue: 50,
      previousValue: 100,
      callerRole: "tenant",
      override: false,
    });
    expect(withoutOverride.allowed).toBe(false);

    // CLAUDE.md §3.4: "admin can override" — not tenant. A tenant client
    // could still send override: true in the request body; the server
    // action resolves callerRole from profiles.role server-side, but this
    // function must independently refuse to honor the flag for a tenant
    // regardless of who calls it, since it's the actual enforcement point.
    const withOverride = evaluateMeterReadingEntry({
      enteredValue: 50,
      previousValue: 100,
      callerRole: "tenant",
      override: true,
    });
    expect(withOverride.allowed).toBe(false);
  });

  it("rejects an owner's decrease without the override flag, allows it with the flag", () => {
    const withoutOverride = evaluateMeterReadingEntry({
      enteredValue: 50,
      previousValue: 100,
      callerRole: "owner",
      override: false,
    });
    expect(withoutOverride.allowed).toBe(false);

    const withOverride = evaluateMeterReadingEntry({
      enteredValue: 50,
      previousValue: 100,
      callerRole: "owner",
      override: true,
    });
    expect(withOverride).toEqual({ allowed: true });
  });

  it("accepts a string previousValue (PostgREST numeric-column contract), comparing numerically", () => {
    // Not a regression guard: enteredValue is structurally always a number
    // (z.number() input), so JS's `>=` already coerces a string
    // previousValue to numeric comparison with no help from this
    // function's own Number(...) wrap — see the doc comment on
    // evaluateMeterReadingEntry. This test documents the accepted
    // `number | string` contract for previousValue, it does not prove a
    // bug would otherwise occur.
    const increase = evaluateMeterReadingEntry({
      enteredValue: 100,
      previousValue: "90",
      callerRole: "tenant",
      override: false,
    });
    expect(increase).toEqual({ allowed: true });

    const decrease = evaluateMeterReadingEntry({
      enteredValue: 5,
      previousValue: "10",
      callerRole: "tenant",
      override: false,
    });
    expect(decrease.allowed).toBe(false);
  });

  it("includes a role-appropriate reason message on rejection", () => {
    const tenantResult = evaluateMeterReadingEntry({
      enteredValue: 50,
      previousValue: 100,
      callerRole: "tenant",
      override: false,
    });
    expect(tenantResult.allowed).toBe(false);
    if (!tenantResult.allowed) expect(tenantResult.reason).toMatch(/cannot override/i);

    const ownerResult = evaluateMeterReadingEntry({
      enteredValue: 50,
      previousValue: 100,
      callerRole: "owner",
      override: false,
    });
    expect(ownerResult.allowed).toBe(false);
    if (!ownerResult.allowed) expect(ownerResult.reason).toMatch(/override: true/i);
  });
});
