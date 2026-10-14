// Billing periods are stored as "YYYY-MM-01". Emails and in-app
// notifications are rendered outside React (no next-intl `useFormatter`),
// so they format with Intl directly — same options as the UI's month
// labels (e.g. statements-list.tsx): "2026. szeptember" / "September 2026".
export function formatPeriodMonth(period: string, locale: string): string {
  const date = new Date(`${period.slice(0, 7)}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return period;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(date);
}
