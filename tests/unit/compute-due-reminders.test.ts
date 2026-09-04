import { describe, it, expect } from "vitest";
import {
  DEFAULT_PAYMENT_DUE_LEAD_DAYS,
  resolvePaymentDueLeadDays,
  isPaymentDueReminderDay,
  isOverdue,
} from "../../src/server/reminders/compute-due-reminders";

describe("resolvePaymentDueLeadDays", () => {
  it("uses the configured value when present and valid", () => {
    expect(resolvePaymentDueLeadDays({ paymentDue: 5 })).toBe(5);
  });
  it("falls back to the default for missing/invalid/negative values", () => {
    expect(resolvePaymentDueLeadDays({})).toBe(DEFAULT_PAYMENT_DUE_LEAD_DAYS);
    expect(resolvePaymentDueLeadDays(null)).toBe(DEFAULT_PAYMENT_DUE_LEAD_DAYS);
    expect(resolvePaymentDueLeadDays({ paymentDue: "3" })).toBe(DEFAULT_PAYMENT_DUE_LEAD_DAYS);
    expect(resolvePaymentDueLeadDays({ paymentDue: -1 })).toBe(DEFAULT_PAYMENT_DUE_LEAD_DAYS);
  });
});

describe("isPaymentDueReminderDay", () => {
  it("fires exactly leadDays before the due date", () => {
    expect(isPaymentDueReminderDay("2026-09-10", 3, "2026-09-07")).toBe(true);
  });
  it("does not fire on any other day", () => {
    expect(isPaymentDueReminderDay("2026-09-10", 3, "2026-09-06")).toBe(false);
    expect(isPaymentDueReminderDay("2026-09-10", 3, "2026-09-08")).toBe(false);
    expect(isPaymentDueReminderDay("2026-09-10", 3, "2026-09-10")).toBe(false);
  });
  it("handles a month boundary correctly", () => {
    expect(isPaymentDueReminderDay("2026-10-02", 3, "2026-09-29")).toBe(true);
  });
  it("handles zero lead days (fires on the due date itself)", () => {
    expect(isPaymentDueReminderDay("2026-09-10", 0, "2026-09-10")).toBe(true);
  });
});

describe("isOverdue", () => {
  it("matches deriveStatementDisplayStatus's boundary: issued/partially_paid + due_date < today", () => {
    expect(isOverdue("issued", "2026-09-01", "2026-09-02")).toBe(true);
    expect(isOverdue("partially_paid", "2026-09-01", "2026-09-02")).toBe(true);
  });
  it("is false on the due date itself, not just after", () => {
    expect(isOverdue("issued", "2026-09-02", "2026-09-02")).toBe(false);
  });
  it("is false for paid/draft regardless of date", () => {
    expect(isOverdue("paid", "2026-01-01", "2026-09-02")).toBe(false);
    expect(isOverdue("draft", "2026-01-01", "2026-09-02")).toBe(false);
  });
  it("is false when there's no due date", () => {
    expect(isOverdue("issued", null, "2026-09-02")).toBe(false);
  });
});
