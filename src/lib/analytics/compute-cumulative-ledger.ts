// Phase 4b admin analytics — cumulative "billed vs received" per tenancy,
// admin/owner-facing only (IDEAS.md line 33: the tenant must never see a
// cumulative total-paid-to-date).
//
// Deliberately NOT called "income vs cost": this schema has no owner-side
// expense data (ROADMAP's tax bullet keeps owner-outflow tracking in
// IDEAS.md as research-gated). What the data supports is a collections
// view — how much has been billed and how much has come in, over the
// whole tenancy.
//
// Both curves are bucketed by "when money moved", not by billing period:
// billed by statement `issued_at` month, received by payment `paid_at`
// month. Statements are retroactive by design (issued in M+1 for month M
// — see the overdue-grace work in PR #31), so bucketing billed by
// period_month against received-by-paid-date would render every tenancy
// permanently in arrears as an artifact of the axis choice.

export interface LedgerStatement {
  issuedAt: string; // ISO timestamp or "YYYY-MM-DD"; only the month matters
  total: number;
}

export interface LedgerPayment {
  paidAt: string; // "YYYY-MM-DD"
  amount: number;
}

export interface CumulativeLedgerPoint {
  month: string; // "YYYY-MM-01"
  billed: number; // cumulative Σ statement totals issued on/before this month
  received: number; // cumulative Σ payments received on/before this month
  outstanding: number; // billed − received (can go negative if the tenant is ahead)
}

/** Inclusive list of "YYYY-MM-01" strings from `startMonth` to `endMonth`. */
export function monthsRange(startMonth: string, endMonth: string): string[] {
  const start = `${startMonth.slice(0, 7)}-01`;
  const end = `${endMonth.slice(0, 7)}-01`;
  const out: string[] = [];
  let cursor = start;
  // Guard against a reversed range or runaway loop (25 years of months).
  for (let i = 0; i < 300 && cursor <= end; i++) {
    out.push(cursor);
    const y = Number(cursor.slice(0, 4));
    const m = Number(cursor.slice(5, 7));
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    cursor = `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-01`;
  }
  return out;
}

export function computeCumulativeLedger(input: {
  statements: LedgerStatement[];
  payments: LedgerPayment[];
  months: string[]; // oldest-first "YYYY-MM-01"
}): CumulativeLedgerPoint[] {
  const billedByMonth = new Map<string, number>();
  for (const s of input.statements) {
    const key = `${s.issuedAt.slice(0, 7)}-01`;
    billedByMonth.set(key, (billedByMonth.get(key) ?? 0) + s.total);
  }
  const receivedByMonth = new Map<string, number>();
  for (const p of input.payments) {
    const key = `${p.paidAt.slice(0, 7)}-01`;
    receivedByMonth.set(key, (receivedByMonth.get(key) ?? 0) + p.amount);
  }

  let billed = 0;
  let received = 0;
  return input.months.map((month) => {
    billed += billedByMonth.get(month) ?? 0;
    received += receivedByMonth.get(month) ?? 0;
    return { month, billed, received, outstanding: billed - received };
  });
}
