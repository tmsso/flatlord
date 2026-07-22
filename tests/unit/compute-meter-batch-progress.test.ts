import { describe, expect, it } from "vitest";
import { computeMeterBatchProgress, type MeterBatchReadingInput } from "../../src/lib/billing/compute-meter-batch-progress";

function reading(overrides: Partial<MeterBatchReadingInput>): MeterBatchReadingInput {
  return {
    id: "reading-1",
    meterId: "meter-1",
    status: "submitted",
    createdAt: "2026-07-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeMeterBatchProgress", () => {
  it("counts verified vs total across distinct meters", () => {
    const result = computeMeterBatchProgress(
      ["meter-1", "meter-2"],
      [reading({ id: "r1", meterId: "meter-1", status: "verified" }), reading({ id: "r2", meterId: "meter-2", status: "submitted" })],
    );
    expect(result.verifiedCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.allVerified).toBe(false);
  });

  it("is allVerified once every active meter's latest reading is verified", () => {
    const result = computeMeterBatchProgress(
      ["meter-1", "meter-2"],
      [reading({ id: "r1", meterId: "meter-1", status: "verified" }), reading({ id: "r2", meterId: "meter-2", status: "verified" })],
    );
    expect(result.allVerified).toBe(true);
  });

  it("is not allVerified when there are zero active meters", () => {
    const result = computeMeterBatchProgress([], []);
    expect(result.totalCount).toBe(0);
    expect(result.allVerified).toBe(false);
  });

  it("dedupes to the latest reading per meter by createdAt (reject then resubmit)", () => {
    const result = computeMeterBatchProgress(
      ["meter-1"],
      [
        reading({ id: "r1", meterId: "meter-1", status: "rejected", createdAt: "2026-07-01T00:00:00Z" }),
        reading({ id: "r2", meterId: "meter-1", status: "submitted", createdAt: "2026-07-05T00:00:00Z" }),
      ],
    );
    expect(result.latestByMeter["meter-1"].id).toBe("r2");
    expect(result.latestByMeter["meter-1"].status).toBe("submitted");
    expect(result.verifiedCount).toBe(0);
  });

  it("does not count a meter with no reading at all this batch", () => {
    const result = computeMeterBatchProgress(["meter-1", "meter-2"], [reading({ id: "r1", meterId: "meter-1", status: "verified" })]);
    expect(result.latestByMeter["meter-2"]).toBeUndefined();
    expect(result.verifiedCount).toBe(1);
    expect(result.totalCount).toBe(2);
  });

  it("ignores readings for meters outside the active set", () => {
    const result = computeMeterBatchProgress(
      ["meter-1"],
      [reading({ id: "r1", meterId: "meter-1", status: "verified" }), reading({ id: "r2", meterId: "meter-removed", status: "verified" })],
    );
    expect(result.totalCount).toBe(1);
    expect(result.verifiedCount).toBe(1);
    expect(result.allVerified).toBe(true);
  });
});
