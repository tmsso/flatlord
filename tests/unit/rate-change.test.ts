import { describe, it, expect } from "vitest";
import { lastDayOfPreviousMonth, planRateChange } from "../../src/lib/billing/rate-change";

describe("lastDayOfPreviousMonth", () => {
  it("handles month lengths and year boundaries", () => {
    expect(lastDayOfPreviousMonth("2026-03-01")).toBe("2026-02-28");
    expect(lastDayOfPreviousMonth("2028-03-01")).toBe("2028-02-29");
    expect(lastDayOfPreviousMonth("2027-01-01")).toBe("2026-12-31");
  });
});

describe("planRateChange", () => {
  const open = { id: "a", validFrom: "2026-01-01", validTo: null };

  it("first rate on a tenancy needs no close", () => {
    expect(planRateChange("2026-01-01", [], null)).toEqual({ ok: true, closeScheduleId: null, closeOn: null });
  });

  it("closes the open rate on the last day of the previous month", () => {
    expect(planRateChange("2026-11-01", [open], "2026-10-01")).toEqual({ ok: true, closeScheduleId: "a", closeOn: "2026-10-31" });
  });

  it("rejects a start in or before the last billed month", () => {
    expect(planRateChange("2026-10-01", [open], "2026-10-01")).toEqual({ ok: false, reason: "periodLocked" });
    expect(planRateChange("2026-09-01", [open], "2026-10-01")).toEqual({ ok: false, reason: "periodLocked" });
  });

  it("is append-only: not on or before an existing rate's start", () => {
    expect(planRateChange("2026-01-01", [open], null)).toEqual({ ok: false, reason: "notAfterExisting" });
    expect(planRateChange("2025-12-01", [open], null)).toEqual({ ok: false, reason: "notAfterExisting" });
  });

  it("rejects overlapping a closed rate that runs past the new start", () => {
    const closed = { id: "b", validFrom: "2026-01-01", validTo: "2026-12-31" };
    expect(planRateChange("2026-06-01", [closed], null)).toEqual({ ok: false, reason: "notAfterExisting" });
    expect(planRateChange("2027-01-01", [closed], null)).toEqual({ ok: true, closeScheduleId: null, closeOn: null });
  });
});
