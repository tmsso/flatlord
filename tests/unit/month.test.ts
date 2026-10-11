import { describe, expect, it } from "vitest";
import { addMonths } from "../../src/lib/month";

describe("addMonths", () => {
  it.each([
    ["2026-10-01", 1, "2026-11-01"],
    ["2026-12-01", 1, "2027-01-01"],
    ["2026-01-01", -1, "2025-12-01"],
    ["2026-03-01", -14, "2025-01-01"],
  ])("%s %+d → %s", (from, delta, expected) => {
    expect(addMonths(from, delta)).toBe(expected);
  });
});
