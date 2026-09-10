import { describe, expect, it } from "vitest";
import {
  DEFAULT_RECONFIRMATION_DUE_DAYS,
  DEFAULT_RECONFIRMATION_MONTH_DAY,
  addDaysUtc,
  addMonthsUtc,
  isReconfirmationDueDay,
  nextScheduledReconfirmationDate,
  resolveReconfirmationSchedule,
} from "../../src/server/reminders/compute-reconfirmation-schedule";

describe("resolveReconfirmationSchedule", () => {
  it("returns null when the reconfirmation config is absent", () => {
    expect(resolveReconfirmationSchedule({})).toBeNull();
    expect(resolveReconfirmationSchedule(null)).toBeNull();
    expect(resolveReconfirmationSchedule({ paymentDue: 3 })).toBeNull();
  });

  it("returns null when intervalMonths is missing, non-numeric or < 1", () => {
    expect(resolveReconfirmationSchedule({ reconfirmation: {} })).toBeNull();
    expect(resolveReconfirmationSchedule({ reconfirmation: { intervalMonths: "12" } })).toBeNull();
    expect(resolveReconfirmationSchedule({ reconfirmation: { intervalMonths: 0 } })).toBeNull();
  });

  it("parses a valid config and applies defaults", () => {
    expect(resolveReconfirmationSchedule({ reconfirmation: { intervalMonths: 12 } })).toEqual({
      intervalMonths: 12,
      monthDay: DEFAULT_RECONFIRMATION_MONTH_DAY,
      dueDays: DEFAULT_RECONFIRMATION_DUE_DAYS,
    });
  });

  it("honours monthDay and dueDays, clamping monthDay to 1..28", () => {
    expect(resolveReconfirmationSchedule({ reconfirmation: { intervalMonths: 6, monthDay: 15, dueDays: 21 } })).toEqual({
      intervalMonths: 6,
      monthDay: 15,
      dueDays: 21,
    });
    expect(resolveReconfirmationSchedule({ reconfirmation: { intervalMonths: 6, monthDay: 40 } })?.monthDay).toBe(28);
    expect(resolveReconfirmationSchedule({ reconfirmation: { intervalMonths: 6, monthDay: 0 } })?.monthDay).toBe(1);
  });
});

describe("addMonthsUtc", () => {
  it("adds whole months, returning the first of the target month", () => {
    expect(addMonthsUtc("2026-01-15", 1)).toBe("2026-02-01");
    expect(addMonthsUtc("2026-11-30", 2)).toBe("2027-01-01");
    expect(addMonthsUtc("2026-06-10", 12)).toBe("2027-06-01");
  });
});

describe("addDaysUtc", () => {
  it("adds days across month boundaries", () => {
    expect(addDaysUtc("2026-09-10", 30)).toBe("2026-10-10");
    expect(addDaysUtc("2026-01-20", 15)).toBe("2026-02-04");
  });
});

describe("nextScheduledReconfirmationDate", () => {
  const schedule = { intervalMonths: 12, monthDay: 1, dueDays: 30 };

  it("first run: the next monthDay on or after today", () => {
    expect(nextScheduledReconfirmationDate(null, schedule, "2026-09-10")).toBe("2026-10-01");
    expect(nextScheduledReconfirmationDate(null, schedule, "2026-09-01")).toBe("2026-09-01");
  });

  it("first run with a mid-month monthDay", () => {
    expect(nextScheduledReconfirmationDate(null, { ...schedule, monthDay: 15 }, "2026-09-20")).toBe("2026-10-15");
    expect(nextScheduledReconfirmationDate(null, { ...schedule, monthDay: 15 }, "2026-09-10")).toBe("2026-09-15");
  });

  it("recurring: monthDay of the month intervalMonths after the last campaign", () => {
    expect(nextScheduledReconfirmationDate("2025-10-01T09:00:00Z", schedule, "2026-09-10")).toBe("2026-10-01");
    expect(nextScheduledReconfirmationDate("2026-03-01T09:00:00Z", { ...schedule, intervalMonths: 6 }, "2026-09-10")).toBe(
      "2026-09-01",
    );
  });
});

describe("isReconfirmationDueDay", () => {
  const schedule = { intervalMonths: 12, monthDay: 1, dueDays: 30 };

  it("is due once today reaches the next scheduled date", () => {
    // last campaign 2025-10-15, 12-month interval, monthDay 1 → next due 2026-10-01
    expect(isReconfirmationDueDay("2025-10-15T09:00:00Z", schedule, "2026-09-30")).toBe(false);
    expect(isReconfirmationDueDay("2025-10-15T09:00:00Z", schedule, "2026-10-01")).toBe(true);
    expect(isReconfirmationDueDay("2025-10-15T09:00:00Z", schedule, "2026-12-05")).toBe(true); // overdue still fires
  });

  it("first-run is not due until its chosen day arrives", () => {
    expect(isReconfirmationDueDay(null, { ...schedule, monthDay: 15 }, "2026-09-10")).toBe(false);
    expect(isReconfirmationDueDay(null, { ...schedule, monthDay: 15 }, "2026-09-15")).toBe(true);
  });
});
