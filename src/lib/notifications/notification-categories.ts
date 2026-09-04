// The original four automatic/background notification events wired into
// the centre (ROADMAP Phase 3 item 4), plus two more added by Phase 4's
// cron reminders: `amount_due` (automatic payment-due reminder — distinct
// from send-amount-due-email.ts's admin-triggered one-off send, which
// stays out of the centre, see migration 0022's comment) and `overdue`
// (admin-facing "this statement just went overdue" alert).
export const NOTIFICATION_CATEGORIES = ["request", "notice", "inventory", "field_edit", "amount_due", "overdue"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// Which categories a given role can ever actually receive — drives which
// toggles the preferences UI shows per role, so a user isn't offered a
// switch for a category that can never fire for them.
export const OWNER_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = ["request", "inventory", "field_edit", "overdue"];
export const TENANT_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = ["request", "notice", "amount_due"];

// profiles.notification_prefs shape: { [category]: { email: boolean } }.
// Missing category/key = opted in (CLAUDE.md doesn't ask for an opt-in
// flow — everything is on by default, matching how the fan-out already
// behaved before preferences existed).
export function shouldEmailNotification(prefs: unknown, category: string): boolean {
  const map = (prefs ?? {}) as Record<string, { email?: boolean } | undefined>;
  return map[category]?.email !== false;
}
