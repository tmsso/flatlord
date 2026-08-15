import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { DeclarationDocument } from "../../src/lib/documents/declaration-template";
import { extractPdfText } from "../../src/lib/contracts/extract-pdf-text";

// Real risk this test guards against: @react-pdf/renderer's built-in
// base-14 fonts have no glyphs for Hungarian double-acute characters
// (ő/ű) — an unregistered font silently renders them as blank boxes
// instead of throwing, so "a PDF was produced" is not proof the content
// is correct. This round-trips a synthetic Hungarian string through the
// actual renderer and back out through this repo's own PDF text
// extractor (unpdf, already used for contract parsing) to prove the
// registered IBM Plex Sans font actually carries those glyphs.
//
// Synthetic name only, per CLAUDE.md §0's privacy rule — never a real
// tenant's name.
describe("declaration PDF font registration", () => {
  it("preserves Hungarian ő/ű through render + text extraction", async () => {
    const buffer = await renderToBuffer(
      DeclarationDocument({
        owners: [{ name: "Kovács Őrs" }],
        property: { addressLine: "Fő utca 1., Győr", hrsz: null },
        occupant: {
          name: "Sárközi Üveges Réka",
          dob: "1990-01-01",
          documentNumber: null,
          citizenship: "magyar",
          registrationType: "main_address",
        },
        issueDate: "2026-01-01",
      }),
    );

    const text = await extractPdfText(new Uint8Array(buffer));
    expect(text).toBeTruthy();
    expect(text).toContain("Kovács Őrs");
    expect(text).toContain("Sárközi Üveges Réka");
    expect(text).toContain("Fő utca");
    expect(text).toContain("Győr");
  });
});
