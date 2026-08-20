import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isLocale, defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/lib/notifications/load-messages";
import { buildRequestEventMessage } from "@/lib/notifications/request-event-message";

export type RequestNotificationEvent = "opened" | "message" | "resolved" | "rejected" | "withdrawn";

// Same service-role rationale as send-inventory-discrepancy-email.ts:
// whichever side triggered the event, the *other* side's contact email
// needs a cross-role lookup the caller's own RLS-scoped client can't do
// (a tenant can't read the owner's profile/auth email, and vice versa
// isn't guaranteed either once more than one owner exists — Phase 5).
//
// Best-effort, never throws — a broken email send must not roll back the
// mutation that already happened (same principle as logAudit's failure
// handling). Resend is sandbox-mode-only right now (known, tracked
// separately); this just needs the send-call to execute, not to prove
// real delivery.
export async function notifyRequestEvent(params: {
  requestId: string;
  event: RequestNotificationEvent;
  // Who performed the action — decides which side gets notified.
  // "opened"/"withdrawn" are always tenant-originated in practice, but
  // actorRole is passed explicitly rather than re-derived so callers stay
  // the single source of truth for who just acted.
  actorRole: "owner" | "tenant";
}) {
  try {
    const service = createServiceRoleClient();
    const { data: request, error: requestError } = await service
      .from("requests")
      .select("id, tenancy_id, property_id, title")
      .eq("id", params.requestId)
      .maybeSingle();
    if (requestError || !request) {
      console.error("notifyRequestEvent: request not found", params.requestId, requestError?.message);
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);
    const notifyOwner = params.actorRole === "tenant";

    if (notifyOwner) {
      const { data: ownerships, error: ownershipError } = await service
        .from("property_ownership")
        .select("person_id")
        .eq("property_id", request.property_id);
      if (ownershipError || !ownerships?.length) {
        console.error("notifyRequestEvent: no owners found for property", request.property_id, ownershipError?.message);
        return;
      }
      const { data: ownerProfiles, error: profileError } = await service
        .from("profiles")
        .select("id, locale")
        .eq("role", "owner")
        .in(
          "person_id",
          ownerships.map((o) => o.person_id),
        );
      if (profileError || !ownerProfiles?.length) {
        console.error("notifyRequestEvent: no owner profiles found", profileError?.message);
        return;
      }

      for (const profile of ownerProfiles) {
        const { data: userResult, error: userError } = await service.auth.admin.getUserById(profile.id);
        const ownerEmail = userResult?.user?.email;
        if (userError || !ownerEmail) {
          console.error("notifyRequestEvent: could not resolve owner email", profile.id, userError?.message);
          continue;
        }
        const locale = isLocale(profile.locale) ? profile.locale : defaultLocale;
        const messages = await loadMessages(locale);
        const { subject, body } = buildRequestEventMessage({
          locale,
          messages,
          event: params.event,
          title: request.title,
          forOwner: true,
        });
        const { error: sendError } = await resend.emails.send({
          from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
          to: ownerEmail,
          subject,
          text: body,
        });
        if (sendError) console.error("notifyRequestEvent: send failed", sendError.message);
      }
    } else {
      const { data: tenancy, error: tenancyError } = await service
        .from("tenancies")
        .select("primary_tenant_id")
        .eq("id", request.tenancy_id)
        .maybeSingle();
      if (tenancyError || !tenancy) {
        console.error("notifyRequestEvent: tenancy not found", request.tenancy_id, tenancyError?.message);
        return;
      }
      const { data: tenant } = await service
        .from("persons")
        .select("contact_email")
        .eq("id", tenancy.primary_tenant_id)
        .maybeSingle();
      const tenantEmail = tenant?.contact_email as string | null | undefined;
      if (!tenantEmail) {
        console.error("notifyRequestEvent: tenant has no contact email on file", tenancy.primary_tenant_id);
        return;
      }
      const { data: tenantProfile } = await service
        .from("profiles")
        .select("locale")
        .eq("person_id", tenancy.primary_tenant_id)
        .eq("role", "tenant")
        .maybeSingle();
      const locale = isLocale(tenantProfile?.locale) ? tenantProfile.locale : defaultLocale;
      const messages = await loadMessages(locale);
      const { subject, body } = buildRequestEventMessage({
        locale,
        messages,
        event: params.event,
        title: request.title,
        forOwner: false,
      });
      const { error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
        to: tenantEmail,
        subject,
        text: body,
      });
      if (sendError) console.error("notifyRequestEvent: send failed", sendError.message);
    }
  } catch (err) {
    console.error("notifyRequestEvent: unexpected failure", err instanceof Error ? err.message : err);
  }
}
