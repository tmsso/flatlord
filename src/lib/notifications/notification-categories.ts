// The original four automatic/background notification events wired into
// the centre (ROADMAP Phase 3 item 4), plus two added by Phase 4's first
// cron batch — `amount_due` (automatic payment-due reminder, distinct
// from send-amount-due-email.ts's admin-triggered one-off send, see
// migration 0022's comment) and `overdue` — plus three added by Phase 4's
// lead-reminder batch: `meter_reading` (tenant "submit your photos"
// nudge), `contract` (owner contract-expiry alert) and `rate_review`
// (owner "a fixed charge rate is scheduled to end" alert). The inventory
// action_by alert reuses the existing `inventory` category.
//
// notifications.category is `text` with no CHECK (migration 0022), so a
// new value needs no migration — only this list and its i18n
// category_<name> label keys.
// ...and two more from Phase 4a's statement auto-draft: `statement_drafted`
// (owner "a draft statement is ready to issue") and `statement_draft_blocked`
// (owner "couldn't auto-draft — verified readings still missing").
export const NOTIFICATION_CATEGORIES = [
  "request",
  "notice",
  "inventory",
  "field_edit",
  "amount_due",
  "overdue",
  "meter_reading",
  "contract",
  "rate_review",
  "statement_drafted",
  "statement_draft_blocked",
  "reconfirmation",
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// Which categories a given role can ever actually receive — drives which
// toggles the preferences UI shows per role, so a user isn't offered a
// switch for a category that can never fire for them.
export const OWNER_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "request",
  "inventory",
  "field_edit",
  "overdue",
  "contract",
  "rate_review",
  "statement_drafted",
  "statement_draft_blocked",
  "reconfirmation",
];
export const TENANT_NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = [
  "request",
  "notice",
  "amount_due",
  "meter_reading",
  "reconfirmation",
];

// profiles.notification_prefs shape: { [category]: { email: boolean } }.
// Missing category/key = opted in (CLAUDE.md doesn't ask for an opt-in
// flow — everything is on by default, matching how the fan-out already
// behaved before preferences existed).
export function shouldEmailNotification(prefs: unknown, category: string): boolean {
  const map = (prefs ?? {}) as Record<string, { email?: boolean } | undefined>;
  return map[category]?.email !== false;
}
