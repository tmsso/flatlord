import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isLocale, defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/lib/notifications/load-messages";
import { createTranslator } from "next-intl";
import { createNotification } from "@/server/notifications/create-notification";
import { shouldEmailNotification } from "@/lib/notifications/notification-categories";

// Admin-facing "this statement just went overdue" alert (ROADMAP Phase 4
// item 1) — fired by the daily cron. Deliberately just an alert, not an
// auto-issued late-payment notice: CLAUDE.md §3.8's notices are always
// admin-issued, formal warnings cite a contract clause and carry a
// first/second/final sequence the admin has to choose — nothing here
// should short-circuit that judgment call. Best-effort, never throws.
export async function notifyOverdueStatement(params: { statementId: string }) {
  try {
    const service = createServiceRoleClient();
    const { data: statement, error: statementError } = await service
      .from("statements")
      .select("id, tenancy_id, period_month")
      .eq("id", params.statementId)
      .maybeSingle();
    if (statementError || !statement) {
      console.error("notifyOverdueStatement: statement not found", params.statementId, statementError?.message);
      return;
    }

    const { data: tenancy, error: tenancyError } = await service
      .from("tenancies")
      .select("property_id, primary_tenant_id")
      .eq("id", statement.tenancy_id)
      .maybeSingle();
    if (tenancyError || !tenancy) {
      console.error("notifyOverdueStatement: tenancy not found", statement.tenancy_id, tenancyError?.message);
      return;
    }

    const { data: tenant } = await service
      .from("persons")
      .select("given_name, family_name")
      .eq("id", tenancy.primary_tenant_id)
      .maybeSingle();
    const tenantName = tenant ? `${tenant.given_name} ${tenant.family_name}` : "—";

    const { data: ownerships, error: ownershipError } = await service
      .from("property_ownership")
      .select("person_id")
      .eq("property_id", tenancy.property_id);
    if (ownershipError || !ownerships?.length) {
      console.error("notifyOverdueStatement: no owners found for property", tenancy.property_id, ownershipError?.message);
      return;
    }
    const { data: ownerProfiles, error: profileError } = await service
      .from("profiles")
      .select("id, locale, notification_prefs")
      .eq("role", "owner")
      .in(
        "person_id",
        ownerships.map((o) => o.person_id),
      );
    if (profileError || !ownerProfiles?.length) {
      console.error("notifyOverdueStatement: no owner profiles found", profileError?.message);
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    for (const profile of ownerProfiles) {
      const locale = isLocale(profile.locale) ? profile.locale : defaultLocale;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const messages: any = await loadMessages(locale);
      const t = createTranslator({ locale, messages, namespace: "notifications" });
      const subject = t("overdueSubject", { tenant: tenantName, period: statement.period_month });
      const body = t("overdueBody", { tenant: tenantName, period: statement.period_month });

      await createNotification({
        recipientProfileId: profile.id,
        category: "overdue",
        title: subject,
        body,
        entityType: "statement",
        entityId: statement.id,
      });

      if (!shouldEmailNotification(profile.notification_prefs, "overdue")) continue;
      const { data: userResult, error: userError } = await service.auth.admin.getUserById(profile.id);
      const ownerEmail = userResult?.user?.email;
      if (userError || !ownerEmail) {
        console.error("notifyOverdueStatement: could not resolve owner email", profile.id, userError?.message);
        continue;
      }
      const { error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
        to: ownerEmail,
        subject,
        text: body,
      });
      if (sendError) console.error("notifyOverdueStatement: send failed", sendError.message);
    }
  } catch (err) {
    console.error("notifyOverdueStatement: unexpected failure", err instanceof Error ? err.message : err);
  }
}
