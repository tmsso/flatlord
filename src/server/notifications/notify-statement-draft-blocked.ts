import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyOwners } from "@/server/notifications/notify-owners";

// "Couldn't auto-draft the {period} statement for {tenant} — these meters
// still have no verified reading: {labels}" — owner alert fired by the
// daily cron's auto-draft pass (ROADMAP Phase 4a) once a period is past
// its grace day with readings still missing. One per tenancy per period
// (the caller dedupes on entity + category + this-month). Links to the
// tenancy (no statement row exists yet). Best-effort, never throws.
export async function notifyStatementDraftBlocked(params: {
  tenancyId: string;
  periodMonth: string;
  missingMeterLabels: string[];
}) {
  try {
    const service = createServiceRoleClient();
    const { data: tenancy, error } = await service
      .from("tenancies")
      .select("property_id, persons(given_name, family_name)")
      .eq("id", params.tenancyId)
      .maybeSingle();
    if (error || !tenancy?.property_id) {
      console.error("notifyStatementDraftBlocked: tenancy not resolvable", params.tenancyId, error?.message);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const person: any = Array.isArray(tenancy.persons) ? tenancy.persons[0] : tenancy.persons;
    const tenantName = person ? `${person.given_name} ${person.family_name}` : "—";
    const meters = params.missingMeterLabels.join(", ") || "—";

    await notifyOwners({
      propertyId: tenancy.property_id,
      category: "statement_draft_blocked",
      entityType: "tenancy",
      entityId: params.tenancyId,
      build: (t) => ({
        subject: t("statementDraftBlockedSubject", { tenant: tenantName, period: params.periodMonth }),
        body: t("statementDraftBlockedBody", { tenant: tenantName, period: params.periodMonth, meters }),
      }),
    });
  } catch (err) {
    console.error("notifyStatementDraftBlocked: unexpected failure", err instanceof Error ? err.message : err);
  }
}
