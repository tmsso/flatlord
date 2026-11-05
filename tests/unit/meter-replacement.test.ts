import { describe, expect, it } from "vitest";
import { earliestReplacementDate } from "../../src/lib/billing/meter-replacement";
import { computeStatement, type ChargeTypeInput, type MeterInput, type MeterReadingInput } from "../../src/lib/billing/compute-statement";

describe("earliestReplacementDate (B-52)", () => {
  it("is the installation date for a fresh meter on an unbilled unit", () => {
    expect(earliestReplacementDate({ installedAt: "2026-03-10", latestReadingDate: null, statementMonths: [] })).toBe("2026-03-10");
  });

  it("is not before the latest reading", () => {
    expect(earliestReplacementDate({ installedAt: "2026-01-01", latestReadingDate: "2026-04-20", statementMonths: ["2026-03-01"] })).toBe("2026-04-20");
  });

  it("skips past the last month that already has a statement, across a year end", () => {
    expect(
      earliestReplacementDate({ installedAt: "2026-01-01", latestReadingDate: "2026-12-20", statementMonths: ["2026-11-01", "2026-12-01"] }),
    ).toBe("2027-01-01");
  });
});

// The engine is unchanged by B-52; these pin the replacement contract the
// action relies on (the change month itself is covered in compute-statement.test.ts).
describe("computeStatement after a replacement dated on the 1st of the next open month", () => {
  const type: ChargeTypeInput = { id: "ct-el", kind: "metered", name: "Electricity" };
  const schedules = [{ id: "s", chargeTypeId: "ct-el", amount: null, ratePerUnit: 10, validFrom: "2026-01-01", validTo: null }];
  const oldMeter: MeterInput = { id: "old", chargeTypeId: "ct-el", label: "Old", baseValue: 0, installedAt: "2026-01-01", removedAt: "2026-11-01" };
  const newMeter: MeterInput = { id: "new", chargeTypeId: "ct-el", label: "New", baseValue: 5, installedAt: "2026-11-01", removedAt: null };
  const r = (id: string, meterId: string, readingDate: string, confirmedValue: number): MeterReadingInput => ({
    id,
    meterId,
    readingDate,
    createdAt: `${readingDate}T00:00:00Z`,
    confirmedValue,
  });
  const readings = [
    r("oct", "old", "2026-10-20", 1000), // last billed (October issued)
    r("final", "old", "2026-11-01", 1030), // final reading at replacement
    r("nov", "new", "2026-11-20", 45), // first regular reading on the new meter
    r("dec", "new", "2026-12-20", 100),
  ];
  const input = { chargeTypes: [type], chargeSchedules: schedules, meters: [oldMeter, newMeter], meterReadings: readings, adjustments: [] };

  it("bills the change month across both meters: (old final − old previous) + (new current − new base)", () => {
    const { lineItems, total, warnings } = computeStatement({ ...input, periodMonth: "2026-11-01" });
    expect(warnings).toEqual([]);
    expect(lineItems.map((l) => [l.meterId, l.quantity])).toEqual([
      ["old", 30],
      ["new", 40],
    ]);
    expect(total).toBe((30 + 40) * 10);
  });

  it("bills only the new meter the month after, from its own reading", () => {
    const { lineItems, warnings } = computeStatement({ ...input, periodMonth: "2026-12-01" });
    expect(warnings).toEqual([]);
    expect(lineItems.map((l) => [l.meterId, l.quantity])).toEqual([["new", 55]]);
  });
});
