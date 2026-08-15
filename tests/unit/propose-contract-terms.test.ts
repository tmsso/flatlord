import { describe, expect, it } from "vitest";
import { proposeContractTerms } from "../../src/lib/contracts/propose-contract-terms";

// Pure-function tests, no DB — same pattern as parse-sheet-months.test.ts.
// Sample text below is authored for this test, not copied from any real
// contract (CLAUDE.md §0) — synthetic property/person/amounts throughout.

describe("proposeContractTerms", () => {
  it("returns no proposals for null/empty text", () => {
    expect(proposeContractTerms(null)).toEqual({});
    expect(proposeContractTerms("")).toEqual({});
    expect(proposeContractTerms("   ")).toEqual({});
  });

  it("picks up the first two numeric dates as term start/end, in document order", () => {
    const text = "A bérleti jogviszony kezdete: 2024.09.01, vége: 2026.08.31.";
    const proposals = proposeContractTerms(text);
    expect(proposals.termStart?.value).toBe("2024-09-01");
    expect(proposals.termEnd?.value).toBe("2026-08-31");
    expect(proposals.termStart?.snippet).toContain("2024.09.01");
  });

  it("also recognizes Hungarian long-form dates", () => {
    const text = "A szerződés 2024. szeptember 1. napján lép hatályba.";
    const proposals = proposeContractTerms(text);
    expect(proposals.termStart?.value).toBe("2024-09-01");
  });

  it("extracts a notice period in days", () => {
    const text = "A felmondási idő 30 nap, írásban közlendő.";
    const proposals = proposeContractTerms(text);
    expect(proposals.noticeDays?.value).toBe(30);
  });

  it("extracts a deposit amount with thousands separators", () => {
    const text = "A bérlő kaució címén 440.000 Ft-ot fizet a szerződés aláírásakor.";
    const proposals = proposeContractTerms(text);
    expect(proposals.depositAmount?.value).toBe(440000);
  });

  it("also matches óvadék phrasing with a space-separated amount", () => {
    const text = "Az óvadék összege 220 000 HUF.";
    const proposals = proposeContractTerms(text);
    expect(proposals.depositAmount?.value).toBe(220000);
  });

  it("ignores an out-of-range month/day so it isn't mistaken for a date", () => {
    const text = "Rendelési szám: 2024.13.99 (nem dátum).";
    const proposals = proposeContractTerms(text);
    expect(proposals.termStart).toBeUndefined();
  });

  it("returns an empty object when nothing matches", () => {
    const text = "Ez egy szöveg, amiben semmilyen szerkezeti adat nincs.";
    expect(proposeContractTerms(text)).toEqual({});
  });
});
