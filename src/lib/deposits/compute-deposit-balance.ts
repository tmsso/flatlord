export type DepositTransactionType = "paid" | "applied" | "retained" | "refunded";

export interface DepositTransactionAmount {
  type: DepositTransactionType;
  amount: number;
}

// Sign each transaction type contributes to the running balance. 'paid'
// is money received into the deposit (+); 'applied' offsets a fee and
// 'refunded' returns money to the tenant, both reducing what's still held
// (-). 'retained' carries no sign of its own: per CLAUDE.md §3.2's own
// worked example (a 440,000 HUF deposit — 220,000 applied as a fee
// reduction, 220,000 "retained as security"), the retained figure is
// simply naming the balance that paid/applied already produce at that
// point, not a further deduction — giving it a sign would double-count
// against the same money. It's still worth its own transaction type (an
// admin can record "as of termination, X remains held as security" for
// history), it just doesn't move the number.
const BALANCE_SIGN: Record<DepositTransactionType, number> = {
  paid: 1,
  applied: -1,
  refunded: -1,
  retained: 0,
};

export function computeDepositBalance(transactions: DepositTransactionAmount[]): number {
  return transactions.reduce((sum, t) => sum + BALANCE_SIGN[t.type] * t.amount, 0);
}
