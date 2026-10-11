// Snippets for contract search hits (design/09 11). The database decides
// *whether* a version matches (search_vector); this only finds *where*,
// for display. Case-insensitive, quotes/operators from websearch syntax
// stripped; each word of the query is a candidate term.
const CONTEXT = 60;

export function contractSnippets(text: string, query: string, max = 3): { before: string; match: string; after: string }[] {
  const terms = query
    .replace(/["()]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^-/, ""))
    .filter((w) => w.length >= 2 && !/^(or|and)$/i.test(w));
  if (terms.length === 0 || !text) return [];

  const lower = text.toLocaleLowerCase();
  const hits: { start: number; end: number }[] = [];
  for (const term of terms) {
    const needle = term.toLocaleLowerCase();
    let from = 0;
    while (hits.length < 50) {
      const at = lower.indexOf(needle, from);
      if (at === -1) break;
      hits.push({ start: at, end: at + needle.length });
      from = at + needle.length;
    }
  }
  hits.sort((a, b) => a.start - b.start);

  const out: { before: string; match: string; after: string }[] = [];
  let lastEnd = -1;
  for (const h of hits) {
    if (h.start < lastEnd) continue; // overlaps the previous snippet's context
    const from = Math.max(0, h.start - CONTEXT);
    const to = Math.min(text.length, h.end + CONTEXT);
    out.push({
      before: (from > 0 ? "…" : "") + text.slice(from, h.start).replace(/\s+/g, " "),
      match: text.slice(h.start, h.end),
      after: text.slice(h.end, to).replace(/\s+/g, " ") + (to < text.length ? "…" : ""),
    });
    lastEnd = to;
    if (out.length >= max) break;
  }
  return out;
}
