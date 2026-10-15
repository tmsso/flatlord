import { describe, it, expect } from "vitest";
import { computeProgress, parseFlow, resolveStep, type OnboardingFacts } from "../../src/lib/onboarding/progress";

const none: OnboardingFacts = { ownNameSet: false, hasUnit: false, billingReady: false, hasTenancy: false, ratesSet: false, tenantInvited: false };

describe("onboarding progress", () => {
  it("a brand-new owner starts at their own details", () => {
    expect(computeProgress("full", none).firstOpen).toBe("you");
  });

  it("resumes at the first missing step (abandoned after adding the flat)", () => {
    const p = computeProgress("full", { ...none, ownNameSet: true, hasUnit: true });
    expect(p.firstOpen).toBe("billing");
    expect(p.steps.map((s) => s.done)).toEqual([true, true, false, false, false, false]);
  });

  it("is complete when every fact holds", () => {
    const all = { ownNameSet: true, hasUnit: true, billingReady: true, hasTenancy: true, ratesSet: true, tenantInvited: true };
    expect(computeProgress("full", all).firstOpen).toBeNull();
  });

  it("the tenant flow ignores own-name and flat steps", () => {
    const p = computeProgress("tenant", { ...none, hasUnit: true, billingReady: true });
    expect(p.steps.map((s) => s.key)).toEqual(["tenant", "rates", "invite"]);
    expect(p.firstOpen).toBe("tenant");
  });

  it("rates/invite can't count as done without a tenancy", () => {
    expect(computeProgress("tenant", { ...none, ratesSet: true, tenantInvited: true }).steps.every((s) => !s.done)).toBe(true);
  });

  it("honours a requested step only if it belongs to the flow", () => {
    const p = computeProgress("flat", none);
    expect(resolveStep("flat", "billing", p)).toBe("billing");
    expect(resolveStep("flat", "invite", p)).toBe("flat");
    expect(resolveStep("flat", undefined, p)).toBe("flat");
  });

  it("parses unknown flows as full", () => {
    expect(parseFlow("tenant")).toBe("tenant");
    expect(parseFlow("bogus")).toBe("full");
    expect(parseFlow(undefined)).toBe("full");
  });
});
