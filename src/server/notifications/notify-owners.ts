import "server-only";
import { Resend } from "resend";
import { createTranslator } from "next-intl";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadMessages } from "@/lib/notifications/load-messages";
import { createNotification } from "@/server/notifications/create-notification";
import { shouldEmailNotification } from "@/lib/notifications/notification-categories";
import { resolveOwnerRecipients, resolveProfileEmail } from "@/server/notifications/resolve-recipients";
import type { Locale } from "@/i18n/config";

type Translator = ReturnType<typeof createTranslator>;

// Shared owner fan-out for the notify-*.ts modules that alert every owner
// of a property (contract-expiry, rate-review, inventory action_by — the
// ROADMAP Phase 4 lead-reminder batch). Each owner is messaged in their
// own stored locale. In-app row always written; email gated per owner by
// their notification_prefs. Best-effort, never throws.
export async function notifyOwners(params: {
  propertyId: string;
  category: string;
  entityType: string;
  entityId: string;
  build: (t: Translator, locale: Locale) => { subject: string; body: string };
}) {
  try {
    const service = createServiceRoleClient();
    const owners = await resolveOwnerRecipients(service, params.propertyId);
    if (owners.length === 0) {
      console.error("notifyOwners: no owner recipients for property", params.propertyId);
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    for (const owner of owners) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any = await loadMessages(owner.locale);
      const t = createTranslator({ locale: owner.locale, messages, namespace: "notifications" });
      const { subject, body } = params.build(t, owner.locale);

      await createNotification({
        recipientProfileId: owner.profileId,
        category: params.category,
        title: subject,
        body,
        entityType: params.entityType,
        entityId: params.entityId,
      });

      if (!shouldEmailNotification(owner.notificationPrefs, params.category)) continue;
      const email = await resolveProfileEmail(service, owner.profileId);
      if (!email) continue;
      const { error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
        to: email,
        subject,
        text: body,
      });
      if (sendError) console.error("notifyOwners: send failed", params.category, sendError.message);
    }
  } catch (err) {
    console.error("notifyOwners: unexpected failure", params.category, err instanceof Error ? err.message : err);
  }
}
