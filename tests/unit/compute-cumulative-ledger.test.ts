import { describe, expect, it } from "vitest";
import { computeCumulativeLedger, monthsRange } from "../../src/lib/analytics/compute-cumulative-ledger";

describe("monthsRange", () => {
  it("is inclusive of both ends, first-of-month", () => {
    expect(monthsRange("2026-01-15", "2026-04-02")).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
  });
  it("handles a single month", () => {
    expect(monthsRange("2026-06-01", "2026-06-30")).toEqual(["2026-06-01"]);
  });
  it("crosses a year boundary", () => {
    expect(monthsRange("2025-11-01", "2026-01-01")).toEqual(["2025-11-01", "2025-12-01", "2026-01-01"]);
    expect(monthsRange("2025-11-10", "2026-02-05")).toEqual(["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  });
  it("returns empty for a reversed range", () => {
    expect(monthsRange("2026-05-01", "2026-01-01")).toEqual([]);
  });
});

describe("computeCumulativeLedger", () => {
  const months = ["2026-01-01", "2026-02-01", "2026-03-01"];

  it("accumulates billed by issued_at month and received by paid_at month", () => {
    const result = computeCumulativeLedger({
      statements: [
        { issuedAt: "2026-01-20T10:00:00Z", total: 100_000 },
        { issuedAt: "2026-02-05", total: 120_000 },
      ],
      payments: [
        { paidAt: "2026-02-03", amount: 100_000 },
        { paidAt: "2026-03-01", amount: 90_000 },
      ],
      months,
    });
    expect(result).toEqual([
      { month: "2026-01-01", billed: 100_000, received: 0, outstanding: 100_000 },
      { month: "2026-02-01", billed: 220_000, received: 100_000, outstanding: 120_000 },
      { month: "2026-03-01", billed: 220_000, received: 190_000, outstanding: 30_000 },
    ]);
  });

  it("carries the running totals flat across months with no activity", () => {
    const result = computeCumulativeLedger({
      statements: [{ issuedAt: "2026-01-10", total: 50_000 }],
      payments: [],
      months,
    });
    expect(result.map((p) => p.billed)).toEqual([50_000, 50_000, 50_000]);
    expect(result.map((p) => p.received)).toEqual([0, 0, 0]);
  });

  it("allows outstanding to go negative when the tenant is ahead", () => {
    const result = computeCumulativeLedger({
      statements: [{ issuedAt: "2026-02-01", total: 100_000 }],
      payments: [{ paidAt: "2026-01-15", amount: 150_000 }],
      months,
    });
    expect(result[0].outstanding).toBe(-150_000); // prepaid
    expect(result[2].outstanding).toBe(-50_000);
  });

  it("ignores activity outside the month window", () => {
    const result = computeCumulativeLedger({
      statements: [{ issuedAt: "2025-12-01", total: 999 }],
      payments: [{ paidAt: "2026-09-01", amount: 999 }],
      months,
    });
    expect(result.every((p) => p.billed === 0 && p.received === 0)).toBe(true);
  });
});
