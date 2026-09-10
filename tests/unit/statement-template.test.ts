import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { StatementDocument, type StatementPdfData } from "../../src/lib/documents/statement-template";

const base: StatementPdfData = {
  periodMonth: "2026-08-01",
  status: "partially_paid",
  issuedAt: "2026-08-01T09:00:00.000Z",
  dueDate: "2026-08-05",
  total: 293660,
  currency: "HUF",
  propertyName: "Demo Flat",
  propertyAddress: "1 Example Street, Exampletown",
  tenantName: "Test Tenant",
  landlordNames: "Test Owner",
  paymentInstructions: "Bank transfer to IBAN XX00 0000 0000",
  lineItems: [
    { description: "Rent", quantity: null, unitRate: null, amount: 250000, isBillable: true, group: "fixed" },
    { description: "Electricity", quantity: 120, unitRate: 49, amount: 5880, isBillable: true, group: "metered" },
    { description: "Gas (tracked only)", quantity: 30, unitRate: 0, amount: 0, isBillable: false, group: "metered" },
    { description: "Goodwill credit", quantity: null, unitRate: null, amount: -5000, isBillable: true, group: "adjustments" },
  ],
  payments: [{ amount: 100000, paidAt: "2026-08-04", method: "bank_transfer" }],
};

describe("StatementDocument", () => {
  it("renders a non-empty PDF for hu and en, with double-acute glyphs in play", async () => {
    for (const locale of ["hu", "en"] as const) {
      const buf = await renderToBuffer(StatementDocument({ data: base, locale }));
      expect(buf.length).toBeGreaterThan(1000);
      expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    }
  });

  it("renders with no payments and no payment instructions", async () => {
    const buf = await renderToBuffer(
      StatementDocument({ data: { ...base, payments: [], paymentInstructions: null, status: "issued" }, locale: "en" }),
    );
    expect(buf.length).toBeGreaterThan(1000);
  });

  it("tolerates an unknown status/method by falling back to the raw value", async () => {
    const buf = await renderToBuffer(
      StatementDocument({
        data: { ...base, status: "weird_status", payments: [{ amount: 1, paidAt: "2026-08-04", method: "carrier_pigeon" }] },
        locale: "hu",
      }),
    );
    expect(buf.length).toBeGreaterThan(1000);
  });
});
