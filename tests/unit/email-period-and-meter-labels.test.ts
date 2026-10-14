import { describe, expect, it } from "vitest";
import { formatPeriodMonth } from "../../src/lib/format/format-period-month";
import { formatMeterList } from "../../src/lib/notifications/meter-list-label";
import { assessAutoDraftReadiness } from "../../src/server/reminders/compute-autodraft";

describe("formatPeriodMonth", () => {
  it("renders a stored period as a localized month", () => {
    expect(formatPeriodMonth("2026-09-01", "hu")).toBe("2026. szeptember");
    expect(formatPeriodMonth("2026-09-01", "en")).toBe("September 2026");
  });
  it("does not shift the month in either direction across time zones", () => {
    expect(formatPeriodMonth("2026-01-01", "en")).toBe("January 2026");
    expect(formatPeriodMonth("2026-12-01", "en")).toBe("December 2026");
  });
  it("returns unparseable input unchanged", () => {
    expect(formatPeriodMonth("not-a-date", "hu")).toBe("not-a-date");
  });
});

describe("formatMeterList", () => {
  const kindLabel = (k: string) => ({ electricity: "Villanyóra", gas: "Gázóra", water: "Vízóra", other: "Mérőóra" })[k] ?? k;
  it("adds the type to generic or repeated labels", () => {
    expect(
      formatMeterList(
        [
          { label: "Mérőóra", kind: "electricity" },
          { label: "Mérőóra", kind: "gas" },
          { label: "Fürdőszoba", kind: "water" },
        ],
        kindLabel,
      ),
    ).toBe("Mérőóra (Villanyóra), Mérőóra (Gázóra), Fürdőszoba (Vízóra)");
  });
  it("doesn't repeat a label that already is the type name", () => {
    expect(formatMeterList([{ label: "villanyóra", kind: "electricity" }, { label: "Mérőóra", kind: "other" }], kindLabel)).toBe(
      "villanyóra, Mérőóra",
    );
  });
});

describe("assessAutoDraftReadiness — missing meters", () => {
  it("returns the missing meters themselves, kinds included", () => {
    const meters = [
      { id: "a", label: "Meter", kind: "electricity" as const, installedAt: "2020-01-01", removedAt: null },
      { id: "b", label: "Meter", kind: "gas" as const, installedAt: "2020-01-01", removedAt: null },
    ];
    const readings = [{ meterId: "a", readingDate: "2026-09-30", status: "verified" }];
    const result = assessAutoDraftReadiness("2026-09-01", meters, readings);
    expect(result).toEqual({ ready: false, missingMeterLabels: ["Meter"], missingMeters: [meters[1]] });
  });
});
