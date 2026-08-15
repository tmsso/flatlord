// Regex/heuristic proposal of structured key terms from a contract's
// extracted text (ROADMAP Phase 2: contract intake parsing). Deliberately
// not an LLM/OCR pipeline — OPENROUTER_API_KEY is unset in this
// environment, and per the ROADMAP's own wording ("admin reviews
// field-by-field, nothing auto-committed") a rough heuristic that's easy
// to eyeball against its source snippet is a better fit than a black-box
// model call anyway. Every candidate carries the exact snippet it was
// matched from so the review UI can show "why this value" at a glance.
//
// Patterns are tuned to real Hungarian rental-contract phrasing (see
// CLAUDE.md §0 — no real contract text lives in this repo, these were
// written against the *shape* of that language, not copied from any real
// document): numeric dates (2024.09.01 / 2024-09-01) and Hungarian
// long-form dates (2024. szeptember 1.), "felmondási idő ... N nap" for
// notice period, "kaució"/"óvadék" followed by a Ft/HUF amount for
// deposit. This is intentionally simple pattern-matching, not a general
// NLP parser — it will miss unusual phrasing, which is exactly why every
// proposal is a suggestion the admin accepts or ignores, never an
// auto-fill.

export interface TermCandidate<T> {
  value: T;
  snippet: string;
}

export interface ProposedContractTerms {
  termStart?: TermCandidate<string>;
  termEnd?: TermCandidate<string>;
  noticeDays?: TermCandidate<number>;
  depositAmount?: TermCandidate<number>;
}

const HU_MONTHS: Record<string, string> = {
  január: "01",
  február: "02",
  március: "03",
  április: "04",
  május: "05",
  június: "06",
  július: "07",
  augusztus: "08",
  szeptember: "09",
  október: "10",
  november: "11",
  december: "12",
};

const NUMERIC_DATE_RE = /\b(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})\.?/g;
const HU_LONG_DATE_RE = new RegExp(
  `\\b(\\d{4})\\.?\\s*(${Object.keys(HU_MONTHS).join("|")})\\s*(\\d{1,2})\\.?`,
  "gi",
);
const NOTICE_DAYS_RE = /felmondási\s*id[őo][^\d]{0,25}(\d{1,3})\s*nap/i;
const DEPOSIT_RE = /(kauci[óo]|óvadék)[^0-9]{0,30}([\d][\d.,\s]{2,12}\d)\s*(Ft|HUF)/i;

function pad2(n: string | number): string {
  return String(n).padStart(2, "0");
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + length + 20);
  return text.slice(start, end).trim().replace(/\s+/g, " ");
}

function findDates(text: string): TermCandidate<string>[] {
  const found: TermCandidate<string>[] = [];

  for (const m of text.matchAll(NUMERIC_DATE_RE)) {
    const [, year, month, day] = m;
    const monthNum = Number(month);
    const dayNum = Number(day);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) continue;
    found.push({
      value: `${year}-${pad2(month)}-${pad2(day)}`,
      snippet: snippetAround(text, m.index ?? 0, m[0].length),
    });
  }

  for (const m of text.matchAll(HU_LONG_DATE_RE)) {
    const [, year, monthName, day] = m;
    const monthNum = HU_MONTHS[monthName.toLowerCase()];
    if (!monthNum) continue;
    found.push({
      value: `${year}-${monthNum}-${pad2(day)}`,
      snippet: snippetAround(text, m.index ?? 0, m[0].length),
    });
  }

  // Dedupe by value, keep first occurrence (earliest in document order is
  // the more likely "term start" in a typical contract preamble).
  const seen = new Set<string>();
  return found.filter((c) => (seen.has(c.value) ? false : (seen.add(c.value), true)));
}

function parseDepositAmount(raw: string): number {
  // Strip thousands separators (., space) and normalize a decimal comma
  // away — deposits in practice are always whole HUF amounts.
  return Number(raw.replace(/[.\s]/g, "").replace(",", ""));
}

export function proposeContractTerms(text: string | null | undefined): ProposedContractTerms {
  if (!text || text.trim().length === 0) return {};

  const proposals: ProposedContractTerms = {};

  const dates = findDates(text);
  if (dates[0]) proposals.termStart = dates[0];
  if (dates[1]) proposals.termEnd = dates[1];

  const noticeMatch = text.match(NOTICE_DAYS_RE);
  if (noticeMatch) {
    proposals.noticeDays = {
      value: Number(noticeMatch[1]),
      snippet: snippetAround(text, noticeMatch.index ?? 0, noticeMatch[0].length),
    };
  }

  const depositMatch = text.match(DEPOSIT_RE);
  if (depositMatch) {
    const amount = parseDepositAmount(depositMatch[2]);
    if (Number.isFinite(amount) && amount > 0) {
      proposals.depositAmount = {
        value: amount,
        snippet: snippetAround(text, depositMatch.index ?? 0, depositMatch[0].length),
      };
    }
  }

  return proposals;
}
