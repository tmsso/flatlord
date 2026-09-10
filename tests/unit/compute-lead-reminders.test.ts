import { describe, expect, it } from "vitest";
import {
  matchedLeadDays,
  isLeadReminderDay,
  isMeterReadingReminderDay,
  resolveMeterReadingLeadDays,
  resolveContractExpiryLeadDays,
  resolveRateReviewLeadDays,
  resolveInventoryActionByLeadDays,
  resolveMeterReadingWindowStartDay,
  isMonthlyMeterReading,
  DEFAULT_METER_READING_LEAD_DAYS,
  DEFAULT_CONTRACT_EXPIRY_LEAD_DAYS,
  DEFAULT_RATE_REVIEW_LEAD_DAYS,
  DEFAULT_INVENTORY_ACTION_BY_LEAD_DAYS,
  DEFAULT_METER_READING_WINDOW_START_DAY,
} from "../../src/server/reminders/compute-lead-reminders";

describe("matchedLeadDays", () => {
  it("returns the lead value on its exact fire day", () => {
    // 2026-06-01 minus 30 days = 2026-05-02
    expect(matchedLeadDays("2026-06-01", [60, 30], "2026-05-02")).toBe(30);
    // 2026-06-01 minus 60 days = 2026-04-02
    expect(matchedLeadDays("2026-06-01", [60, 30], "2026-04-02")).toBe(60);
  });

  it("returns null on every other day, including one day off", () => {
    expect(matchedLeadDays("2026-06-01", [60, 30], "2026-05-01")).toBeNull();
    expect(matchedLeadDays("2026-06-01", [60, 30], "2026-05-03")).toBeNull();
    expect(matchedLeadDays("2026-06-01", [60, 30], "2026-06-01")).toBeNull();
  });

  it("ignores negative or non-finite lead entries", () => {
    expect(matchedLeadDays("2026-06-01", [-5, Number.NaN, 30], "2026-05-02")).toBe(30);
  });

  it("crosses month and year boundaries with real date math", () => {
    // 2027-01-15 minus 30 days = 2026-12-16
    expect(matchedLeadDays("2027-01-15", [30], "2026-12-16")).toBe(30);
  });
});

describe("isLeadReminderDay", () => {
  it("is true only on the fire day", () => {
    expect(isLeadReminderDay("2026-03-31", 14, "2026-03-17")).toBe(true);
    expect(isLeadReminderDay("2026-03-31", 14, "2026-03-18")).toBe(false);
  });
});

describe("isMeterReadingReminderDay", () => {
  it("fires leadDays before the window-start day-of-month", () => {
    // window opens on the 25th, lead 3 -> fires the 22nd
    expect(isMeterReadingReminderDay(25, 3, "2026-06-22")).toBe(true);
    expect(isMeterReadingReminderDay(25, 3, "2026-06-23")).toBe(false);
    expect(isMeterReadingReminderDay(25, 3, "2026-06-21")).toBe(false);
  });

  it("handles a lead that crosses into the previous month", () => {
    // window opens on the 2nd, lead 5 -> fires 2026-05-28
    expect(isMeterReadingReminderDay(2, 5, "2026-05-28")).toBe(true);
  });

  it("clamps an out-of-range window-start day into 1..28", () => {
    expect(isMeterReadingReminderDay(99, 0, "2026-06-28")).toBe(true);
    expect(isMeterReadingReminderDay(0, 0, "2026-06-01")).toBe(true);
  });
});

describe("reminder_lead_days resolvers", () => {
  it("fall back to defaults on null / missing / junk", () => {
    for (const junk of [null, undefined, {}, { meterReading: "soon" }, 42, [], "x"]) {
      expect(resolveMeterReadingLeadDays(junk)).toBe(DEFAULT_METER_READING_LEAD_DAYS);
      expect(resolveRateReviewLeadDays(junk)).toBe(DEFAULT_RATE_REVIEW_LEAD_DAYS);
      expect(resolveInventoryActionByLeadDays(junk)).toBe(DEFAULT_INVENTORY_ACTION_BY_LEAD_DAYS);
      expect(resolveContractExpiryLeadDays(junk)).toEqual(DEFAULT_CONTRACT_EXPIRY_LEAD_DAYS);
    }
  });

  it("read a valid configured value", () => {
    expect(resolveMeterReadingLeadDays({ meterReading: 7 })).toBe(7);
    expect(resolveRateReviewLeadDays({ rateReview: 45 })).toBe(45);
    expect(resolveInventoryActionByLeadDays({ inventoryActionBy: 21 })).toBe(21);
    expect(resolveContractExpiryLeadDays({ contractExpiry: [90, 45, 14] })).toEqual([90, 45, 14]);
  });

  it("filters junk entries out of a contractExpiry array but keeps the valid ones", () => {
    expect(resolveContractExpiryLeadDays({ contractExpiry: [90, "x", -3, 14] })).toEqual([90, 14]);
  });

  it("falls back when contractExpiry is an array with nothing valid left", () => {
    expect(resolveContractExpiryLeadDays({ contractExpiry: ["x", -1] })).toEqual(DEFAULT_CONTRACT_EXPIRY_LEAD_DAYS);
  });

  it("does not share the mutable default array between calls", () => {
    const a = resolveContractExpiryLeadDays(null);
    a.push(999);
    expect(resolveContractExpiryLeadDays(null)).toEqual(DEFAULT_CONTRACT_EXPIRY_LEAD_DAYS);
  });
});

describe("meter_reading_config resolvers", () => {
  it("resolveMeterReadingWindowStartDay clamps and defaults", () => {
    expect(resolveMeterReadingWindowStartDay(null)).toBe(DEFAULT_METER_READING_WINDOW_START_DAY);
    expect(resolveMeterReadingWindowStartDay({ windowStartDay: 10 })).toBe(10);
    expect(resolveMeterReadingWindowStartDay({ windowStartDay: 40 })).toBe(28);
    expect(resolveMeterReadingWindowStartDay({ windowStartDay: 0 })).toBe(1);
    expect(resolveMeterReadingWindowStartDay({ windowStartDay: "x" })).toBe(DEFAULT_METER_READING_WINDOW_START_DAY);
  });

  it("isMonthlyMeterReading treats missing frequency as monthly", () => {
    expect(isMonthlyMeterReading(null)).toBe(true);
    expect(isMonthlyMeterReading({})).toBe(true);
    expect(isMonthlyMeterReading({ frequency: "monthly" })).toBe(true);
    expect(isMonthlyMeterReading({ frequency: "quarterly" })).toBe(false);
  });
});
