function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = value instanceof Date ? value.toISOString() : typeof value === "object" ? JSON.stringify(value) : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// Row shape varies per table, driven by the Drizzle schema — not worth a
// generic row type here, callers already know the columns.
export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Object.keys(rows[0]);
  const header = columns.map(csvCell).join(",");
  const lines = rows.map((row) => columns.map((col) => csvCell(row[col])).join(","));
  return [header, ...lines].join("\n");
}
