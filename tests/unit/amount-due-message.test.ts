import { describe, expect, it } from "vitest";
import { buildAmountDueMessage } from "../../src/lib/notifications/amount-due-message";
import enMessages from "../../messages/en.json";
import huMessages from "../../messages/hu.json";

const baseParams = {
  tenantName: "Alex",
  amount: "45,000 Ft",
  dueDate: "June 5, 2026",
  paymentInstructions: "IBAN HU00 0000 0000 0000 0000 0000 0000",
  portalUrl: "https://flatlord.vercel.app/home/statements/abc",
};

describe("buildAmountDueMessage", () => {
  it("includes amount, due date, payment methods and portal link in English", () => {
    const { subject, body } = buildAmountDueMessage({ locale: "en", messages: enMessages, ...baseParams });
    expect(subject).toBe("Amount due");
    expect(body).toContain("Alex");
    expect(body).toContain("45,000 Ft");
    expect(body).toContain("June 5, 2026");
    expect(body).toContain("IBAN HU00 0000 0000 0000 0000 0000 0000");
    expect(body).toContain("https://flatlord.vercel.app/home/statements/abc");
  });

  it("includes the same content in Hungarian", () => {
    const { subject, body } = buildAmountDueMessage({ locale: "hu", messages: huMessages, ...baseParams });
    expect(subject).toBe("Fizetendő összeg");
    expect(body).toContain("Alex");
    expect(body).toContain("45,000 Ft");
    expect(body).toContain("IBAN HU00 0000 0000 0000 0000 0000 0000");
    expect(body).toContain("https://flatlord.vercel.app/home/statements/abc");
  });

  it("omits the payment-methods line when no instructions are set on the property", () => {
    const { body } = buildAmountDueMessage({ ...baseParams, locale: "en", messages: enMessages, paymentInstructions: null });
    expect(body).not.toContain("Payment methods");
    expect(body).toContain("45,000 Ft");
    expect(body).toContain("https://flatlord.vercel.app/home/statements/abc");
  });
});
