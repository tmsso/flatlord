import { describe, expect, it } from "vitest";
import {
  AUTO_DRAFT_BLOCKED_GRACE_DAY,
  assessAutoDraftReadiness,
  isMeterActiveInPeriod,
  isPastAutoDraftGraceDay,
  nextPeriodStart,
  periodContainsDate,
  previousPeriodMonth,
  type AutoDraftMeter,
  type AutoDraftReading,
} from "../../src/server/reminders/compute-autodraft";

describe("previousPeriodMonth", () => {
  it("returns the just-closed month as YYYY-MM-01", () => {
    expect(previousPeriodMonth("2026-09-10")).toBe("2026-08-01");
    expect(previousPeriodMonth("2026-09-01")).toBe("2026-08-01");
  });
  it("rolls the year back across January", () => {
    expect(previousPeriodMonth("2026-01-15")).toBe("2025-12-01");
  });
});

describe("nextPeriodStart", () => {
  it("returns the first day of the following month", () => {
    expect(nextPeriodStart("2026-08-01")).toBe("2026-09-01");
    expect(nextPeriodStart("2026-12-01")).toBe("2027-01-01");
  });
});

describe("periodContainsDate", () => {
  it("includes the first day, excludes the first of next month", () => {
    expect(periodContainsDate("2026-08-01", "2026-08-01")).toBe(true);
    expect(periodContainsDate("2026-08-01", "2026-08-31")).toBe(true);
    expect(periodContainsDate("2026-08-01", "2026-09-01")).toBe(false);
    expect(periodContainsDate("2026-08-01", "2026-07-31")).toBe(false);
  });
});

describe("isMeterActiveInPeriod", () => {
  it("mirrors compute-statement's relevantMeters filter", () => {
    // installed before end of period, not yet removed
    expect(isMeterActiveInPeriod("2026-01-01", null, "2026-08-01")).toBe(true);
    // installed after the period entirely
    expect(isMeterActiveInPeriod("2026-09-05", null, "2026-08-01")).toBe(false);
    // removed before the period starts
    expect(isMeterActiveInPeriod("2026-01-01", "2026-07-15", "2026-08-01")).toBe(false);
    // removed during the period still counts (reading may exist)
    expect(isMeterActiveInPeriod("2026-01-01", "2026-08-20", "2026-08-01")).toBe(true);
  });
});

describe("isPastAutoDraftGraceDay", () => {
  it(`is false before day ${AUTO_DRAFT_BLOCKED_GRACE_DAY}, true on and after`, () => {
    expect(isPastAutoDraftGraceDay("2026-09-06")).toBe(false);
    expect(isPastAutoDraftGraceDay("2026-09-07")).toBe(true);
    expect(isPastAutoDraftGraceDay("2026-09-30")).toBe(true);
  });
});

describe("assessAutoDraftReadiness", () => {
  const period = "2026-08-01";
  const meters: AutoDraftMeter[] = [
    { id: "m-elec", label: "Electricity", installedAt: "2025-01-01", removedAt: null },
    { id: "m-water", label: "Water", installedAt: "2025-01-01", removedAt: null },
  ];

  it("is ready when every active meter has a verified in-period reading", () => {
    const readings: AutoDraftReading[] = [
      { meterId: "m-elec", readingDate: "2026-08-27", status: "verified" },
      { meterId: "m-water", readingDate: "2026-08-27", status: "verified" },
    ];
    expect(assessAutoDraftReadiness(period, meters, readings)).toEqual({ ready: true });
  });

  it("is ready when there are no meters at all", () => {
    expect(assessAutoDraftReadiness(period, [], [])).toEqual({ ready: true });
  });

  it("reports the labels of meters missing a verified reading", () => {
    const readings: AutoDraftReading[] = [
      { meterId: "m-elec", readingDate: "2026-08-27", status: "verified" },
      { meterId: "m-water", readingDate: "2026-08-27", status: "submitted" }, // not verified
    ];
    expect(assessAutoDraftReadiness(period, meters, readings)).toEqual({
      ready: false,
      missingMeterLabels: ["Water"],
    });
  });

  it("ignores a verified reading dated outside the period", () => {
    const readings: AutoDraftReading[] = [
      { meterId: "m-elec", readingDate: "2026-08-27", status: "verified" },
      { meterId: "m-water", readingDate: "2026-07-27", status: "verified" }, // previous month
    ];
    expect(assessAutoDraftReadiness(period, meters, readings)).toEqual({
      ready: false,
      missingMeterLabels: ["Water"],
    });
  });

  it("does not require a reading for a meter that wasn't active in the period", () => {
    const withFutureMeter: AutoDraftMeter[] = [
      ...meters,
      { id: "m-gas", label: "Gas", installedAt: "2026-09-10", removedAt: null },
    ];
    const readings: AutoDraftReading[] = [
      { meterId: "m-elec", readingDate: "2026-08-27", status: "verified" },
      { meterId: "m-water", readingDate: "2026-08-27", status: "verified" },
    ];
    expect(assessAutoDraftReadiness(period, withFutureMeter, readings)).toEqual({ ready: true });
  });
});
