import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyOwners } from "@/server/notifications/notify-owners";

// "A draft statement for {tenant} ({period}) is ready to issue" — owner
// alert fired by the daily cron's auto-draft pass (ROADMAP Phase 4a)
// after it successfully creates a draft. Deliberately just an alert: the
// cron never issues, the admin issues in one click from the statement
// detail page. Best-effort, never throws.
export async function notifyStatementDrafted(params: { statementId: string }) {
  try {
    const service = createServiceRoleClient();
    const { data: statement, error } = await service
      .from("statements")
      .select("id, tenancy_id, period_month")
      .eq("id", params.statementId)
      .maybeSingle();
    if (error || !statement) {
      console.error("notifyStatementDrafted: statement not found", params.statementId, error?.message);
      return;
    }

    const { data: tenancy, error: tenancyError } = await service
      .from("tenancies")
      .select("property_id, persons(given_name, family_name)")
      .eq("id", statement.tenancy_id)
      .maybeSingle();
    if (tenancyError || !tenancy?.property_id) {
      console.error("notifyStatementDrafted: tenancy not resolvable", statement.tenancy_id, tenancyError?.message);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const person: any = Array.isArray(tenancy.persons) ? tenancy.persons[0] : tenancy.persons;
    const tenantName = person ? `${person.given_name} ${person.family_name}` : "—";

    await notifyOwners({
      propertyId: tenancy.property_id,
      category: "statement_drafted",
      entityType: "statement",
      entityId: statement.id,
      build: (t) => ({
        subject: t("statementDraftedSubject", { tenant: tenantName, period: statement.period_month }),
        body: t("statementDraftedBody", { tenant: tenantName, period: statement.period_month }),
      }),
    });
  } catch (err) {
    console.error("notifyStatementDrafted: unexpected failure", err instanceof Error ? err.message : err);
  }
}
