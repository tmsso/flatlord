import { describe, expect, it } from "vitest";
import { pickTenancy } from "../../src/lib/tenancies/list-active-tenancies";

const options = [
  { id: "a", label: "Flat 1 · Tenant A" },
  { id: "b", label: "Room 2 · Tenant B" },
];

describe("pickTenancy (B-51)", () => {
  it("defaults to the first (longest-running) tenancy", () => {
    expect(pickTenancy(options, undefined)?.id).toBe("a");
  });
  it("honours a requested tenancy the caller owns", () => {
    expect(pickTenancy(options, "b")?.id).toBe("b");
  });
  it("ignores an id that isn't one of the caller's tenancies", () => {
    expect(pickTenancy(options, "foreign")?.id).toBe("a");
  });
  it("returns null with no active tenancy", () => {
    expect(pickTenancy([], "a")).toBeNull();
  });
});
