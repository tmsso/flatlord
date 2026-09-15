import { describe, expect, it } from "vitest";
import { buildTenancyTimeline } from "../../src/lib/analytics/build-tenancy-timeline";

const base = { statements: [], payments: [], requests: [], notices: [] };

describe("buildTenancyTimeline", () => {
  it("merges all four sources into one newest-first feed, normalising dates", () => {
    const events = buildTenancyTimeline({
      ...base,
      statements: [
        { id: "s1", periodMonth: "2026-03-01", issuedAt: "2026-04-02T08:30:00Z", total: 120_000 },
      ],
      payments: [{ id: "p1", paidAt: "2026-04-06", amount: 120_000, method: "bank_transfer" }],
      requests: [
        { id: "r1", title: "Leaky tap", category: "repair", status: "resolved", createdAt: "2026-04-01T10:00:00Z" },
      ],
      notices: [{ id: "n1", title: "Annual review", type: "info", createdAt: "2026-04-06T09:00:00Z" }],
    });
    expect(events.map((e) => [e.date, e.type])).toEqual([
      ["2026-04-06", "notice_issued"], // same date as payment — notice ranks first
      ["2026-04-06", "payment_recorded"],
      ["2026-04-02", "statement_issued"],
      ["2026-04-01", "request_opened"],
    ]);
  });

  it("skips statements that were never issued (draft, no issued_at)", () => {
    const events = buildTenancyTimeline({
      ...base,
      statements: [{ id: "s1", periodMonth: "2026-05-01", issuedAt: null, total: 90_000 }],
    });
    expect(events).toEqual([]);
  });

  it("emits one event per request carrying its current status, not a close event", () => {
    const events = buildTenancyTimeline({
      ...base,
      requests: [
        { id: "r1", title: "A", category: "repair", status: "withdrawn", createdAt: "2026-01-01T00:00:00Z" },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({ status: "withdrawn", category: "repair", title: "A" });
  });

  it("sets deep links for statement/request/notice and null for payment", () => {
    const events = buildTenancyTimeline({
      ...base,
      statements: [{ id: "s1", periodMonth: "2026-01-01", issuedAt: "2026-02-01", total: 1 }],
      payments: [{ id: "p1", paidAt: "2026-02-01", amount: 1, method: "cash" }],
      requests: [{ id: "r1", title: "x", category: "other", status: "open", createdAt: "2026-02-01" }],
      notices: [{ id: "n1", title: "y", type: "info", createdAt: "2026-02-01" }],
    });
    const href = Object.fromEntries(events.map((e) => [e.type, e.href]));
    expect(href).toEqual({
      statement_issued: "/statements/s1",
      payment_recorded: null,
      request_opened: "/requests/r1",
      notice_issued: "/notices/n1",
    });
  });

  it("is deterministic for events sharing a date and type (tiebreak by id)", () => {
    const events = buildTenancyTimeline({
      ...base,
      payments: [
        { id: "p2", paidAt: "2026-02-01", amount: 1, method: "cash" },
        { id: "p1", paidAt: "2026-02-01", amount: 2, method: "cash" },
      ],
    });
    expect(events.map((e) => e.entityId)).toEqual(["p1", "p2"]);
  });
});
