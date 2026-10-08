import { describe, expect, it } from "vitest";
import { resolveMeterReadingWindow } from "../../src/server/reminders/compute-lead-reminders";

describe("resolveMeterReadingWindow", () => {
  it("defaults to the 25th through month end", () => {
    expect(resolveMeterReadingWindow({}, "2026-07-10")).toEqual({ start: "2026-07-25", end: "2026-07-31" });
  });

  it("honours a configured start and end day", () => {
    expect(resolveMeterReadingWindow({ windowStartDay: 20, windowEndDay: 27 }, "2026-07-21")).toEqual({
      start: "2026-07-20",
      end: "2026-07-27",
    });
  });

  it("rolls over to next month once this month's window has passed, across a year end", () => {
    expect(resolveMeterReadingWindow({ windowStartDay: 20, windowEndDay: 27 }, "2026-12-28")).toEqual({
      start: "2027-01-20",
      end: "2027-01-27",
    });
  });

  it("clamps an end day beyond a short month", () => {
    expect(resolveMeterReadingWindow({ windowStartDay: 25, windowEndDay: 31 }, "2026-02-01")).toEqual({
      start: "2026-02-25",
      end: "2026-02-28",
    });
  });
});
