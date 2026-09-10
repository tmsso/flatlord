import "server-only";
import { Resend } from "resend";
import { createTranslator } from "next-intl";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadMessages } from "@/lib/notifications/load-messages";
import { createNotification } from "@/server/notifications/create-notification";
import { shouldEmailNotification } from "@/lib/notifications/notification-categories";
import { resolveTenantRecipient } from "@/server/notifications/resolve-recipients";

// Monthly "time to submit your meter photos" nudge to the primary tenant
// (ROADMAP Phase 4 — one of the four lead-reminder shapes deferred by the
// first cron batch). Fired by the daily cron. Best-effort, never throws —
// same principle as every other notify-*.ts.
export async function notifyMeterReadingReminder(params: { tenancyId: string }) {
  try {
    const service = createServiceRoleClient();

    const recipient = await resolveTenantRecipient(service, params.tenancyId);
    if (!recipient) return;

    const { data: tenancy } = await service
      .from("tenancies")
      .select("property_id")
      .eq("id", params.tenancyId)
      .maybeSingle();
    const { data: property } = tenancy?.property_id
      ? await service.from("properties").select("name").eq("id", tenancy.property_id).maybeSingle()
      : { data: null };
    const propertyName = property?.name ?? "—";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any = await loadMessages(recipient.locale);
    const t = createTranslator({ locale: recipient.locale, messages, namespace: "notifications" });
    const subject = t("meterReadingSubject", { property: propertyName });
    const body = t("meterReadingBody", { property: propertyName });

    await createNotification({
      recipientProfileId: recipient.profileId,
      category: "meter_reading",
      title: subject,
      body,
      entityType: "tenancy",
      entityId: params.tenancyId,
    });

    if (!shouldEmailNotification(recipient.notificationPrefs, "meter_reading")) return;

    const { data: person } = await service
      .from("persons")
      .select("contact_email")
      .eq("id", recipient.personId)
      .maybeSingle();
    const email = person?.contact_email as string | null;
    if (!email) {
      console.error("notifyMeterReadingReminder: tenant has no contact email on file", params.tenancyId);
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
      to: email,
      subject,
      text: body,
    });
    if (sendError) console.error("notifyMeterReadingReminder: send failed", sendError.message);
  } catch (err) {
    console.error("notifyMeterReadingReminder: unexpected failure", err instanceof Error ? err.message : err);
  }
}
