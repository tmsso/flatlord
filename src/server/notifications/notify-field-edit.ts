import "server-only";
import { Resend } from "resend";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isLocale, defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/lib/notifications/load-messages";
import { buildFieldEditMessage } from "@/lib/notifications/field-edit-message";

// `free`-policy person-field edits (CLAUDE.md §3.5: "applies immediately,
// writes history, notifies admin"). Same service-role rationale as
// sendInventoryDiscrepancyEmail: a tenant's own RLS-scoped client can't
// read the owner's contact email. Best-effort, never throws — a broken
// email send must not roll back the edit that already happened.
export async function notifyFieldEdit(params: { propertyId: string | null; fieldLabel: string; personName: string }) {
  try {
    if (!params.propertyId) {
      // A tenant with no active tenancy shouldn't be able to reach this
      // path at all (submit-field-edit.ts resolves entityId to the
      // caller's own person, and only an active tenancy's primary tenant
      // can self-edit today) — defensive early-return, not an expected case.
      console.error("notifyFieldEdit: no propertyId resolved, skipping owner notification");
      return;
    }
    const service = createServiceRoleClient();

    const { data: ownerships, error: ownershipError } = await service
      .from("property_ownership")
      .select("person_id")
      .eq("property_id", params.propertyId);
    if (ownershipError || !ownerships?.length) {
      console.error("notifyFieldEdit: no owners found for property", params.propertyId, ownershipError?.message);
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
      console.error("notifyFieldEdit: no owner profiles found", profileError?.message);
      return;
    }

    const resend = new Resend(process.env.RESEND_API_KEY);

    for (const profile of ownerProfiles) {
      const { data: userResult, error: userError } = await service.auth.admin.getUserById(profile.id);
      const ownerEmail = userResult?.user?.email;
      if (userError || !ownerEmail) {
        console.error("notifyFieldEdit: could not resolve owner email", profile.id, userError?.message);
        continue;
      }

      const locale = isLocale(profile.locale) ? profile.locale : defaultLocale;
      const messages = await loadMessages(locale);
      const { subject, body } = buildFieldEditMessage({
        locale,
        messages,
        fieldLabel: params.fieldLabel,
        personName: params.personName,
      });

      const { error: sendError } = await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
        to: ownerEmail,
        subject,
        text: body,
      });
      if (sendError) console.error("notifyFieldEdit: send failed", sendError.message);
    }
  } catch (err) {
    console.error("notifyFieldEdit: unexpected failure", err instanceof Error ? err.message : err);
  }
}
