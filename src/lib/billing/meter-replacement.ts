// B-52: when may a meter be replaced? Pure, so the rule is unit-tested.
//
// The engine bills a reading in the month of its reading_date, and an
// issued (or drafted) month is never recomputed. The old meter's final
// reading must therefore fall in a month that has no statement yet —
// otherwise the stretch between its last billed reading and the final one
// would never be billed (D-46). Dating the replacement on the 1st of the
// next open month loses nothing: that month's old-meter delta runs from
// the last billed reading to the final value.

/** "YYYY-MM-01" of the month after `month` ("YYYY-MM-DD" or "YYYY-MM-01"). Integer math, no Date. */
function nextMonthStart(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12 ? `${year + 1}-01-01` : `${year}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * Earliest date the replacement may be recorded on: not before the old
 * meter's installation or its latest reading, and not inside any month
 * that already has a (non-discarded) statement on the unit.
 */
export function earliestReplacementDate(params: {
  installedAt: string;
  latestReadingDate: string | null;
  statementMonths: string[]; // period_month of every non-voided statement on the unit
}): string {
  const candidates = [params.installedAt];
  if (params.latestReadingDate) candidates.push(params.latestReadingDate);
  const lastBilled = params.statementMonths.reduce<string | null>((max, m) => (max == null || m > max ? m : max), null);
  if (lastBilled) candidates.push(nextMonthStart(lastBilled));
  // ISO dates compare chronologically as strings.
  return candidates.reduce((max, d) => (d > max ? d : max));
}
