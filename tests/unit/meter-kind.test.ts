import { describe, expect, it } from "vitest";
import { meterKind } from "../../src/lib/billing/meter-kind";

describe("meterKind (B-37)", () => {
  it.each([
    ["water", null, "water"],
    ["water_kitchen", "m3", "water"],
    ["water_bathroom", "m3", "water"],
    ["hot_water", "m3", "water"],
    ["gas", "m3", "gas"],
    ["electricity", "kWh", "electricity"],
    ["heating", "GJ", "heat"],
    ["custom", "kWh", "electricity"],
    ["custom", "GJ", "heat"],
    ["custom", "m3", "other"],
    [null, null, "other"],
  ])("%s / %s → %s", (code, unit, expected) => {
    expect(meterKind(code, unit)).toBe(expected);
  });
});
