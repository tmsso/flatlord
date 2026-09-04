import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { InviteManager } from "@/components/invite-manager";
import { BackupExport } from "@/components/backup-export";
import { FieldPolicyManager } from "@/components/field-editability/field-policy-manager";
import { getFieldPolicyMap } from "@/server/field-editability/get-field-policy-map";
import { NotificationPreferences } from "@/components/notifications/notification-preferences";
import { OWNER_NOTIFICATION_CATEGORIES } from "@/lib/notifications/notification-categories";

export default async function AdminSettingsPage() {
  const t = await getTranslations("nav");
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);

  const { data: ownProfile } = await supabase.from("profiles").select("notification_prefs").eq("id", profile.userId).maybeSingle();

  // owner_scope_invites RLS restricts this to the caller's own reads as an
  // owner; consumed/revoked invites are excluded — they're done, not
  // "pending" from the admin's point of view.
  const { data: invites } = await supabase
    .from("invites")
    .select("id, email, role, expires_at")
    .is("consumed_at", null)
    .is("revoked_at", null)
    .order("created_at", { ascending: false });

  const personPolicyMap = await getFieldPolicyMap(supabase, "person");
  const personPolicies = Object.fromEntries(personPolicyMap);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold">{t("settings")}</h1>
      <InviteManager
        invites={(invites ?? []).map((invite) => ({
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expires_at,
        }))}
      />
      <FieldPolicyManager policies={personPolicies} />
      <NotificationPreferences categories={OWNER_NOTIFICATION_CATEGORIES} prefs={ownProfile?.notification_prefs ?? {}} />
      <BackupExport />
    </div>
  );
}
