import "server-only";
import { Resend } from "resend";
import { createTranslator } from "next-intl";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadMessages } from "@/lib/notifications/load-messages";
import { createNotification } from "@/server/notifications/create-notification";
import { shouldEmailNotification } from "@/lib/notifications/notification-categories";
import { resolveTenantRecipient } from "@/server/notifications/resolve-recipients";
import { notifyOwners } from "@/server/notifications/notify-owners";

// Fired by the daily cron when it auto-launches a scheduled inventory
// reconfirmation campaign (ROADMAP Phase 4a). The tenant gets a "please
// review your inventory items" nudge (they aren't watching for it); the
// owners get an FYI that the schedule fired. Best-effort, never throws —
// the campaign rows are already committed by the time this runs.
export async function notifyReconfirmationScheduled(params: { reconfirmationId: string }) {
  try {
    const service = createServiceRoleClient();
    const { data: campaign, error } = await service
      .from("inventory_reconfirmations")
      .select("id, tenancy_id, property_id, due_date")
      .eq("id", params.reconfirmationId)
      .maybeSingle();
    if (error || !campaign) {
      console.error("notifyReconfirmationScheduled: campaign not found", params.reconfirmationId, error?.message);
      return;
    }

    const dueDate = (campaign.due_date as string | null) ?? "—";

    // --- tenant nudge ---
    const recipient = await resolveTenantRecipient(service, campaign.tenancy_id);
    if (recipient) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any = await loadMessages(recipient.locale);
      const t = createTranslator({ locale: recipient.locale, messages, namespace: "notifications" });
      const subject = t("reconfirmationScheduledTenantSubject");
      const body = t("reconfirmationScheduledTenantBody", { date: dueDate });

      await createNotification({
        recipientProfileId: recipient.profileId,
        category: "reconfirmation",
        title: subject,
        body,
        entityType: "inventory_reconfirmation",
        entityId: campaign.id,
      });

      if (shouldEmailNotification(recipient.notificationPrefs, "reconfirmation")) {
        const { data: person } = await service
          .from("persons")
          .select("contact_email")
          .eq("id", recipient.personId)
          .maybeSingle();
        const email = person?.contact_email as string | null;
        if (email) {
          const resend = new Resend(process.env.RESEND_API_KEY);
          const { error: sendError } = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
            to: email,
            subject,
            text: body,
          });
          if (sendError) console.error("notifyReconfirmationScheduled: tenant send failed", sendError.message);
        } else {
          console.error("notifyReconfirmationScheduled: tenant has no contact email", campaign.tenancy_id);
        }
      }
    }

    // --- owner FYI ---
    if (campaign.property_id) {
      await notifyOwners({
        propertyId: campaign.property_id,
        category: "reconfirmation",
        entityType: "inventory_reconfirmation",
        entityId: campaign.id,
        build: (t) => ({
          subject: t("reconfirmationScheduledOwnerSubject"),
          body: t("reconfirmationScheduledOwnerBody", { date: dueDate }),
        }),
      });
    }
  } catch (err) {
    console.error("notifyReconfirmationScheduled: unexpected failure", err instanceof Error ? err.message : err);
  }
}
