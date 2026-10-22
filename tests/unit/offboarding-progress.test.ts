import { describe, expect, it } from "vitest";
import { computeOffboardingProgress, type OffboardingFacts } from "../../src/lib/offboarding/progress";
import { proRataCredit, monthOf } from "../../src/lib/offboarding/pro-rata";

const base: OffboardingFacts = {
  started: true,
  openRequests: 0,
  metersMissingFinalReading: 0,
  finalStatementIssued: true,
  depositBalance: 0,
  outstandingTotal: 0,
  handoverRecorded: true,
  tenancyEnded: false,
  skipped: new Set(),
};
const statusOf = (f: OffboardingFacts, key: string) => computeOffboardingProgress(f).steps.find((s) => s.key === key)?.status;

describe("computeOffboardingProgress (B-43)", () => {
  it("nothing is done before offboarding starts, even if facts would satisfy it", () => {
    const p = computeOffboardingProgress({ ...base, started: false });
    expect(p.steps.filter((s) => s.status !== "open").map((s) => s.key)).toEqual([]);
    expect(p.readyToEnd).toBe(false);
  });
  it("all steps resolved → ready to end, complete once the tenancy has ended", () => {
    expect(computeOffboardingProgress(base).readyToEnd).toBe(true);
    expect(computeOffboardingProgress(base).complete).toBe(false);
    expect(computeOffboardingProgress({ ...base, tenancyEnded: true }).complete).toBe(true);
  });
  it("a deposit still held keeps the deposit step open", () => {
    expect(statusOf({ ...base, depositBalance: 1000 }, "deposit")).toBe("open");
    expect(computeOffboardingProgress({ ...base, depositBalance: 1000 }).readyToEnd).toBe(false);
  });
  it("a zero deposit with money still outstanding is not settled (D-45)", () => {
    expect(statusOf({ ...base, outstandingTotal: 5000 }, "deposit")).toBe("open");
  });
  it("an explicitly skipped step counts as resolved", () => {
    const f = { ...base, metersMissingFinalReading: 2, skipped: new Set(["readings"] as const) };
    expect(statusOf(f, "readings")).toBe("skipped");
    expect(computeOffboardingProgress(f).readyToEnd).toBe(true);
  });
  it("done wins over skipped", () => {
    expect(statusOf({ ...base, skipped: new Set(["deposit"] as const) }, "deposit")).toBe("done");
  });
});

describe("proRataCredit (B-43)", () => {
  it("credits the unused days of the end month", () => {
    // 30-day month, ends on the 15th → 15/30 of rent
    expect(proRataCredit(200_000, "2026-11-15")).toEqual({ amount: 100_000, unusedDays: 15, daysInMonth: 30 });
  });
  it("no credit when ending on the month's last day (incl. leap February)", () => {
    expect(proRataCredit(200_000, "2026-10-31").amount).toBe(0);
    expect(proRataCredit(200_000, "2028-02-29").amount).toBe(0);
  });
  it("rounds to whole units", () => {
    // 31-day month, ends on the 10th → 21/31 × 100_000 = 67_741.9…
    expect(proRataCredit(100_000, "2026-12-10").amount).toBe(67_742);
  });
  it("monthOf", () => {
    expect(monthOf("2026-11-15")).toBe("2026-11-01");
  });
});
