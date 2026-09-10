import { describe, expect, it } from "vitest";
import { deriveStatementDisplayStatus } from "../../src/lib/billing/derive-statement-display-status";

describe("deriveStatementDisplayStatus", () => {
  it("passes draft through unchanged regardless of due date", () => {
    expect(deriveStatementDisplayStatus("draft", "2026-01-01", "2026-06-01")).toBe("draft");
  });

  it("passes paid through unchanged even past its due date", () => {
    expect(deriveStatementDisplayStatus("paid", "2026-01-01", "2026-06-01")).toBe("paid");
  });

  it("derives overdue for an issued statement past its due date", () => {
    expect(deriveStatementDisplayStatus("issued", "2026-01-01", "2026-06-01")).toBe("overdue");
  });

  it("derives overdue for a partially_paid statement past its due date", () => {
    expect(deriveStatementDisplayStatus("partially_paid", "2026-01-01", "2026-06-01")).toBe("overdue");
  });

  it("does not derive overdue when the due date is today or in the future", () => {
    expect(deriveStatementDisplayStatus("issued", "2026-06-01", "2026-06-01")).toBe("issued");
    expect(deriveStatementDisplayStatus("issued", "2026-07-01", "2026-06-01")).toBe("issued");
  });

  it("does not derive overdue when there is no due date yet", () => {
    expect(deriveStatementDisplayStatus("issued", null, "2026-06-01")).toBe("issued");
  });

  it("does not derive overdue for a freshly-issued retroactive statement (grace window)", () => {
    // August statement issued 2026-09-08, nominal due 2026-08-05.
    expect(deriveStatementDisplayStatus("issued", "2026-08-05", "2026-09-10", "2026-09-08T09:00:00Z")).toBe("issued");
  });

  it("derives overdue again once the retroactive grace window has passed", () => {
    expect(deriveStatementDisplayStatus("issued", "2026-08-05", "2026-09-20", "2026-09-08T09:00:00Z")).toBe("overdue");
  });
});
