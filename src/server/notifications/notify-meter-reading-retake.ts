import "server-only";
import { createResendClient } from "@/lib/email/resend-client";
import { createTranslator } from "next-intl";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { loadMessages } from "@/lib/notifications/load-messages";
import { createNotification } from "@/server/notifications/create-notification";
import { shouldEmailNotification } from "@/lib/notifications/notification-categories";
import { resolveTenantRecipient } from "@/server/notifications/resolve-recipients";

// B-32: the owner asked for a retake ("Ask for retake" in readings
// verification). Tells the primary tenant in-app, and by email if their
// meter_reading preference allows — same category as the monthly reminder,
// so the existing preference toggle covers it. Best-effort, never throws.
export async function notifyMeterReadingRetake(params: { tenancyId: string; meterLabel: string }) {
  try {
    const service = createServiceRoleClient();
    const recipient = await resolveTenantRecipient(service, params.tenancyId);
    if (!recipient) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any = await loadMessages(recipient.locale);
    const t = createTranslator({ locale: recipient.locale, messages, namespace: "notifications" });
    const subject = t("meterRetakeSubject", { meter: params.meterLabel });
    const body = t("meterRetakeBody", { meter: params.meterLabel });

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
    if (!email) return;

    const resend = createResendClient();
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
      to: email,
      subject,
      text: body,
    });
    if (sendError) console.error("notifyMeterReadingRetake: send failed", sendError.message);
  } catch (err) {
    console.error("notifyMeterReadingRetake: unexpected failure", err instanceof Error ? err.message : err);
  }
}
