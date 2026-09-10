import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocale, defaultLocale, type Locale } from "@/i18n/config";

// Shared recipient resolution for the notify-*.ts fan-out modules. Before
// this, notify-overdue-statement / notify-notice-issued / etc. each
// inlined the same property_ownership -> profiles -> auth.getUserById
// walk; the lead-reminder batch (ROADMAP Phase 4) added four more callers
// of the exact same walk, so it's pulled out here. Pure lookups, no
// side effects — every caller is still individually best-effort/never-throws.

export interface Recipient {
  profileId: string;
  locale: Locale;
  notificationPrefs: unknown;
}

/** Every owner profile for a property (via property_ownership). Empty array on any failure — the caller logs. */
export async function resolveOwnerRecipients(
  service: SupabaseClient,
  propertyId: string,
): Promise<Recipient[]> {
  const { data: ownerships, error: ownershipError } = await service
    .from("property_ownership")
    .select("person_id")
    .eq("property_id", propertyId);
  if (ownershipError || !ownerships?.length) {
    if (ownershipError) console.error("resolveOwnerRecipients: ownership lookup failed", ownershipError.message);
    return [];
  }

  const { data: profiles, error: profileError } = await service
    .from("profiles")
    .select("id, locale, notification_prefs")
    .eq("role", "owner")
    .in(
      "person_id",
      ownerships.map((o) => o.person_id),
    );
  if (profileError || !profiles?.length) {
    if (profileError) console.error("resolveOwnerRecipients: profile lookup failed", profileError.message);
    return [];
  }

  return profiles.map((p) => ({
    profileId: p.id as string,
    locale: isLocale(p.locale) ? p.locale : defaultLocale,
    notificationPrefs: p.notification_prefs,
  }));
}

/** The primary tenant's profile for a tenancy. Null on any failure — the caller logs. */
export async function resolveTenantRecipient(
  service: SupabaseClient,
  tenancyId: string,
): Promise<(Recipient & { personId: string }) | null> {
  const { data: tenancy, error: tenancyError } = await service
    .from("tenancies")
    .select("primary_tenant_id")
    .eq("id", tenancyId)
    .maybeSingle();
  if (tenancyError || !tenancy) {
    console.error("resolveTenantRecipient: tenancy lookup failed", tenancyId, tenancyError?.message);
    return null;
  }

  const { data: profile, error: profileError } = await service
    .from("profiles")
    .select("id, locale, notification_prefs")
    .eq("person_id", tenancy.primary_tenant_id)
    .eq("role", "tenant")
    .maybeSingle();
  if (profileError || !profile) {
    console.error("resolveTenantRecipient: tenant profile not found", tenancy.primary_tenant_id, profileError?.message);
    return null;
  }

  return {
    profileId: profile.id as string,
    locale: isLocale(profile.locale) ? profile.locale : defaultLocale,
    notificationPrefs: profile.notification_prefs,
    personId: tenancy.primary_tenant_id as string,
  };
}

/** Resolve a profile id to its Auth login email (owners have no persons.contact_email). Null on failure. */
export async function resolveProfileEmail(service: SupabaseClient, profileId: string): Promise<string | null> {
  const { data, error } = await service.auth.admin.getUserById(profileId);
  if (error || !data?.user?.email) {
    console.error("resolveProfileEmail: could not resolve email", profileId, error?.message);
    return null;
  }
  return data.user.email;
}
