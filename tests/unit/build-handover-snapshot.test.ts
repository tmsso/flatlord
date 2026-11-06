import { describe, expect, it } from "vitest";
import { buildSnapshotInventory, buildSnapshotMeters } from "@/lib/handover/build-snapshot";

describe("buildSnapshotInventory (B-13)", () => {
  it("drops removed items and attaches photo paths per item", () => {
    const items = [
      { id: "a", title: "Sofa", kind: "item", owned_by: "owner", condition: "good", status: "active", notes: null },
      { id: "b", title: "Old lamp", kind: "item", owned_by: "owner", condition: null, status: "removed", notes: null },
    ];
    const out = buildSnapshotInventory(items, [
      { entity_id: "a", storage_path: "p/1.jpg" },
      { entity_id: "a", storage_path: null },
      { entity_id: "b", storage_path: "p/2.jpg" },
    ]);
    expect(out).toEqual([{ id: "a", title: "Sofa", kind: "item", ownedBy: "owner", condition: "good", status: "active", notes: null, photos: ["p/1.jpg"] }]);
  });
});

describe("buildSnapshotMeters (B-13)", () => {
  const meters = [
    { id: "m1", label: "Main", base_value: "100", installed_at: "2026-01-01", removed_at: null, unit: "kWh" },
    { id: "m2", label: "Future", base_value: "0", installed_at: "2026-12-01", removed_at: null, unit: "kWh" },
    { id: "m3", label: "Gone", base_value: "0", installed_at: "2025-01-01", removed_at: "2026-03-01", unit: "m3" },
  ];
  it("uses the latest verified reading on or before the date, else the base value; only meters in service", () => {
    const out = buildSnapshotMeters(
      meters,
      [
        { meter_id: "m1", reading_date: "2026-05-01", confirmed_value: "150", created_at: "2026-05-01T10:00:00Z" },
        { meter_id: "m1", reading_date: "2026-10-01", confirmed_value: "200", created_at: "2026-10-01T10:00:00Z" },
        { meter_id: "m1", reading_date: "2026-12-01", confirmed_value: "999", created_at: "2026-11-02T10:00:00Z" },
      ],
      "2026-11-06",
    );
    expect(out).toEqual([{ meterId: "m1", label: "Main", unit: "kWh", value: 200, readingDate: "2026-10-01", source: "reading" }]);
  });
  it("falls back to the base value", () => {
    expect(buildSnapshotMeters([meters[0]], [], "2026-11-06")[0]).toMatchObject({ value: 100, source: "base", readingDate: null });
  });
});
