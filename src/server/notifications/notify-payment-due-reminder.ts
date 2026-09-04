import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveAmountDueContext } from "@/server/notifications/resolve-amount-due-context";
import { createNotification } from "@/server/notifications/create-notification";
import { shouldEmailNotification } from "@/lib/notifications/notification-categories";

// Automatic counterpart to send-amount-due-email.ts's admin-triggered
// one-off send (ROADMAP Phase 4 item 1) — fired by the daily cron, not a
// user action. Reuses resolveAmountDueContext so the message text can
// never drift between the two send paths. Best-effort, never throws —
// same principle as every other notify-*.ts.
export async function notifyPaymentDueReminder(params: { statementId: string }) {
  try {
    const service = createServiceRoleClient();
    const context = await resolveAmountDueContext(service, params.statementId);
    if (!context) return; // nothing outstanding — see resolveAmountDueContext's own comment
    if (!context.tenantProfileId) {
      console.error("notifyPaymentDueReminder: no tenant profile resolved", params.statementId);
      return;
    }

    await createNotification({
      recipientProfileId: context.tenantProfileId,
      category: "amount_due",
      title: context.subject,
      body: context.body,
      entityType: "statement",
      entityId: params.statementId,
    });

    const { data: profile } = await service.from("profiles").select("notification_prefs").eq("id", context.tenantProfileId).maybeSingle();
    if (!shouldEmailNotification(profile?.notification_prefs, "amount_due")) return;
    if (!context.tenantEmail) {
      console.error("notifyPaymentDueReminder: tenant has no contact email on file", params.statementId);
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
      to: context.tenantEmail,
      subject: context.subject,
      text: context.body,
    });
    if (sendError) console.error("notifyPaymentDueReminder: send failed", sendError.message);
  } catch (err) {
    console.error("notifyPaymentDueReminder: unexpected failure", err instanceof Error ? err.message : err);
  }
}
