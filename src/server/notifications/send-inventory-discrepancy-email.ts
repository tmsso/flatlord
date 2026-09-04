import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isLocale, defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/lib/notifications/load-messages";
import { buildInventoryDiscrepancyMessage } from "@/lib/notifications/inventory-discrepancy-message";
import { createNotification } from "@/server/notifications/create-notification";
import { shouldEmailNotification } from "@/lib/notifications/notification-categories";

// Scoped-down stand-in for CLAUDE.md §3.9's "discrepancies open requests
// automatically" (ROADMAP Phase 2 item 6 scope note — the Requests module
// is Phase 3 and doesn't exist yet). Called from the tenant's own
// reconfirmation-response action, so it needs to read the OWNER's contact
// email/locale — data the calling tenant's own RLS-scoped client cannot
// see (owner_scope_persons/profiles don't grant a tenant visibility into
// another user's profile). service-role is the correct, narrow tool for
// this: bypass RLS for exactly this one cross-role lookup, nothing else.
//
// Best-effort: any failure here is logged, never thrown — a broken email
// send must not block the tenant's confirmation from being recorded (same
// principle as logAudit's own failure handling, src/server/audit/log.ts).
export async function sendInventoryDiscrepancyEmail(params: {
  propertyId: string;
  itemTitle: string;
  tenantNote: string | null;
}) {
  try {
    const service = createServiceRoleClient();

    const { data: ownerships, error: ownershipError } = await service
      .from("property_ownership")
      .select("person_id")
      .eq("property_id", params.propertyId);
    if (ownershipError || !ownerships?.length) {
      console.error("sendInventoryDiscrepancyEmail: no owners found for property", params.propertyId, ownershipError?.message);
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
      console.error("sendInventoryDiscrepancyEmail: no owner profiles found", profileError?.message);
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    for (const profile of ownerProfiles) {
      const locale = isLocale(profile.locale) ? profile.locale : defaultLocale;
      const messages = await loadMessages(locale);
      const { subject, body } = buildInventoryDiscrepancyMessage({
        locale,
        messages,
        itemTitle: params.itemTitle,
        tenantNote: params.tenantNote,
      });

      // No entityType/entityId here — see migration 0022's comment; there's
      // no inventory item detail page to deep-link to yet.
      await createNotification({ recipientProfileId: profile.id, category: "inventory", title: subject, body });

      if (!shouldEmailNotification(profile.notification_prefs, "inventory")) continue;
      const { data: userResult, error: userError } = await service.auth.admin.getUserById(profile.id);
      const ownerEmail = userResult?.user?.email;
      if (userError || !ownerEmail) {
        console.error("sendInventoryDiscrepancyEmail: could not resolve owner email", profile.id, userError?.message);
        continue;
      }

      const { error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
        to: ownerEmail,
        subject,
        text: body,
      });
      if (sendError) console.error("sendInventoryDiscrepancyEmail: send failed", sendError.message);
    }
  } catch (err) {
    console.error("sendInventoryDiscrepancyEmail: unexpected failure", err instanceof Error ? err.message : err);
  }
}
