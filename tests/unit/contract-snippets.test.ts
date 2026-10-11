import { describe, expect, it } from "vitest";
import { contractSnippets } from "../../src/lib/contracts/contract-snippets";

describe("contractSnippets", () => {
  const text = "1. A bérlet határozott idejű. 7.2 A felmondási idő 60 nap, írásban. Felmondás esetén a kaució visszajár.";

  it("finds hits case-insensitively with context; nearby hits share one snippet", () => {
    const s = contractSnippets(text, "felmondás");
    expect(s.map((x) => x.match)).toEqual(["felmondás"]); // "Felmondás" is inside its context
    expect(s[0].before).toContain("7.2 A ");
    const far = contractSnippets(`${text}${" x".repeat(80)} Felmondás vége.`, "felmondás");
    expect(far.map((x) => x.match)).toEqual(["felmondás", "Felmondás"]);
  });

  it("ignores websearch quotes/operators and short words", () => {
    expect(contractSnippets(text, '"kaució" or -x').map((x) => x.match)).toEqual(["kaució"]);
  });

  it("returns nothing for an empty text or query", () => {
    expect(contractSnippets("", "x y")).toEqual([]);
    expect(contractSnippets(text, "  ")).toEqual([]);
  });
});
