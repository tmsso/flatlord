import type { AbstractIntlMessages } from "next-intl";

// Amount-due messages are built in the *tenant's* stored locale
// (profiles.locale), independent of whatever locale the admin's own
// session/request is currently in — src/i18n/request.ts's cookie-based
// resolution doesn't apply here, so messages are loaded directly.
export async function loadMessages(locale: string): Promise<AbstractIntlMessages> {
  return (await import(`../../../messages/${locale}.json`)).default;
}
