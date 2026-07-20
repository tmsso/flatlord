import { describe, expect, it } from "vitest";
import { rowsToCsv } from "../../src/lib/backup/rows-to-csv";

describe("rowsToCsv", () => {
  it("returns an empty string for no rows", () => {
    expect(rowsToCsv([])).toBe("");
  });

  it("writes a header row from the first row's keys", () => {
    expect(rowsToCsv([{ id: "1", name: "Rent" }])).toBe("id,name\n1,Rent");
  });

  it("quotes a value containing a comma", () => {
    expect(rowsToCsv([{ note: "bank transfer, split" }])).toBe('note\n"bank transfer, split"');
  });

  it("quotes and escapes a value containing an embedded quote", () => {
    expect(rowsToCsv([{ note: 'said "hi"' }])).toBe('note\n"said ""hi"""');
  });

  it("renders null and undefined as an empty cell", () => {
    expect(rowsToCsv([{ dueDate: null, note: undefined }])).toBe("dueDate,note\n,");
  });

  it("stringifies a jsonb object column", () => {
    expect(rowsToCsv([{ config: { leadDays: 3 } }])).toBe('config\n"{""leadDays"":3}"');
  });

  it("writes a Date column as a plain ISO string, not double-quoted JSON", () => {
    expect(rowsToCsv([{ createdAt: new Date("2026-01-15T10:00:00.000Z") }])).toBe(
      "createdAt\n2026-01-15T10:00:00.000Z",
    );
  });

  it("writes one line per row, in order", () => {
    expect(rowsToCsv([{ id: "1" }, { id: "2" }])).toBe("id\n1\n2");
  });
});
