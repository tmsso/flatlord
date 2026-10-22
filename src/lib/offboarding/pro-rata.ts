// Pro-rata credit for a tenancy ending mid-month (B-43, D-44). Rent is
// billed monthly in advance and the engine never prorates, so the end
// month's statement carries full rent; the wizard proposes this credit as
// a negative adjustment (reason stated), and the owner confirms it.

function daysInMonth(date: string): number {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** First day of the month containing `date` (YYYY-MM-01). */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/**
 * Credit (a non-negative magnitude) for the days after `endDate` in its
 * month: rent × unused days ÷ days in month, rounded to whole units.
 * 0 when the tenancy ends on the month's last day.
 */
export function proRataCredit(monthlyRent: number, endDate: string): { amount: number; unusedDays: number; daysInMonth: number } {
  const dim = daysInMonth(endDate);
  const unusedDays = dim - Number(endDate.slice(8, 10));
  return { amount: Math.round((monthlyRent * unusedDays) / dim), unusedDays, daysInMonth: dim };
}
