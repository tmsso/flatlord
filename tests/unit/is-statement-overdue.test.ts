import { describe, expect, it } from "vitest";
import { isStatementOverdue, RETROACTIVE_ISSUE_GRACE_DAYS } from "../../src/lib/billing/is-statement-overdue";

describe("isStatementOverdue", () => {
  it("is true for an issued/partially_paid statement past its due date with no issuedAt", () => {
    expect(isStatementOverdue({ status: "issued", dueDate: "2026-01-01", issuedAt: null, today: "2026-06-01" })).toBe(true);
    expect(
      isStatementOverdue({ status: "partially_paid", dueDate: "2026-01-01", issuedAt: null, today: "2026-06-01" }),
    ).toBe(true);
  });

  it("is false for paid/draft regardless of dates", () => {
    expect(isStatementOverdue({ status: "paid", dueDate: "2026-01-01", issuedAt: null, today: "2026-06-01" })).toBe(false);
    expect(isStatementOverdue({ status: "draft", dueDate: "2026-01-01", issuedAt: null, today: "2026-06-01" })).toBe(false);
  });

  it("is false on the due date itself, only after", () => {
    expect(isStatementOverdue({ status: "issued", dueDate: "2026-06-01", issuedAt: null, today: "2026-06-01" })).toBe(false);
    expect(isStatementOverdue({ status: "issued", dueDate: "2026-06-01", issuedAt: null, today: "2026-06-02" })).toBe(true);
  });

  it("is false with no due date", () => {
    expect(isStatementOverdue({ status: "issued", dueDate: null, issuedAt: null, today: "2026-06-01" })).toBe(false);
  });

  describe("retroactive-issue grace", () => {
    // A statement for August, issued 2026-09-08, nominal due date 2026-08-05.
    const dueDate = "2026-08-05";
    const issuedAt = "2026-09-08T09:30:00.000Z";

    it("is NOT overdue the day it's issued, even though today > due_date", () => {
      expect(isStatementOverdue({ status: "issued", dueDate, issuedAt, today: "2026-09-08" })).toBe(false);
    });

    it("is NOT overdue within the grace window after issuance", () => {
      expect(
        isStatementOverdue({ status: "issued", dueDate, issuedAt, today: "2026-09-15" }), // issued + 7
      ).toBe(false);
    });

    it("becomes overdue once the grace window after issuance has passed", () => {
      expect(
        isStatementOverdue({ status: "issued", dueDate, issuedAt, today: "2026-09-16" }), // issued + 8
      ).toBe(true);
    });

    it("grace only applies when issued on/after the due date (prospective issue unaffected)", () => {
      // Issued 2026-08-01, before the 2026-08-05 due date → plain rule.
      expect(
        isStatementOverdue({ status: "issued", dueDate, issuedAt: "2026-08-01T10:00:00Z", today: "2026-08-06" }),
      ).toBe(true);
    });

    it("uses only the date part of an ISO timestamp issuedAt", () => {
      expect(RETROACTIVE_ISSUE_GRACE_DAYS).toBe(7);
      expect(
        isStatementOverdue({ status: "issued", dueDate, issuedAt: "2026-09-08T23:59:59Z", today: "2026-09-15" }),
      ).toBe(false);
    });
  });
});
