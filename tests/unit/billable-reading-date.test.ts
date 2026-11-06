import { describe, expect, it } from "vitest";
import { billableReadingDate } from "@/lib/billing/meter-replacement";

// B-55: a reading dated in a month that already has a statement would never
// be billed; it moves to the first open date instead.
describe("billableReadingDate", () => {
  it("keeps the date when its month has no statement", () => {
    expect(billableReadingDate({ readingDate: "2026-03-20", installedAt: "2025-01-01", statementMonths: ["2026-02-01"] })).toBe("2026-03-20");
  });
  it("moves a reading in an issued/drafted month to the 1st of the next month", () => {
    expect(billableReadingDate({ readingDate: "2026-03-20", installedAt: "2025-01-01", statementMonths: ["2026-02-01", "2026-03-01"] })).toBe("2026-04-01");
  });
  it("moves past the latest billed month, across a year end", () => {
    expect(billableReadingDate({ readingDate: "2026-11-30", installedAt: null, statementMonths: ["2026-12-01"] })).toBe("2027-01-01");
  });
  it("never dates a reading before its meter's installation (future-dated replacement)", () => {
    expect(billableReadingDate({ readingDate: "2026-03-20", installedAt: "2026-04-01", statementMonths: [] })).toBe("2026-04-01");
  });
});
