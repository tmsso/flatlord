import { describe, expect, it } from "vitest";
import { computeDepositBalance } from "../../src/lib/deposits/compute-deposit-balance";

describe("computeDepositBalance", () => {
  it("returns 0 for no transactions", () => {
    expect(computeDepositBalance([])).toBe(0);
  });

  it("paid increases the balance", () => {
    expect(computeDepositBalance([{ type: "paid", amount: 440_000 }])).toBe(440_000);
  });

  it("applied and refunded decrease the balance", () => {
    expect(
      computeDepositBalance([
        { type: "paid", amount: 440_000 },
        { type: "applied", amount: 100_000 },
        { type: "refunded", amount: 50_000 },
      ]),
    ).toBe(290_000);
  });

  it("retained does not change the balance (informational marker only)", () => {
    expect(
      computeDepositBalance([
        { type: "paid", amount: 440_000 },
        { type: "applied", amount: 220_000 },
        { type: "retained", amount: 220_000 },
      ]),
    ).toBe(220_000);
  });

  // CLAUDE.md §3.2's own worked example shape: 440,000 paid, then 220,000
  // applied as a fee reduction spread across two months, then the
  // remainder retained as security at termination — balance should land
  // at exactly the retained figure, matching the real-world numbers.
  it("resolves CLAUDE.md's deposit example to the correct running balance at each step", () => {
    const paid = { type: "paid" as const, amount: 440_000 };
    const appliedMonth1 = { type: "applied" as const, amount: 110_000 };
    const appliedMonth2 = { type: "applied" as const, amount: 110_000 };
    const retained = { type: "retained" as const, amount: 220_000 };

    expect(computeDepositBalance([paid])).toBe(440_000);
    expect(computeDepositBalance([paid, appliedMonth1])).toBe(330_000);
    expect(computeDepositBalance([paid, appliedMonth1, appliedMonth2])).toBe(220_000);
    expect(computeDepositBalance([paid, appliedMonth1, appliedMonth2, retained])).toBe(220_000);
  });
});
