import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyOwners } from "@/server/notifications/notify-owners";

// "This contract term ends in N days" owner alert (ROADMAP Phase 4
// lead-reminder batch). One reminder per configured lead value
// (reminder_lead_days.contractExpiry, default [60, 30]). Fired by the
// daily cron. Best-effort, never throws.
export async function notifyContractExpiry(params: {
  contractId: string;
  leadDays: number;
}) {
  try {
    const service = createServiceRoleClient();
    const { data: contract, error } = await service
      .from("contracts")
      .select("id, property_id, term_end, tenancies(primary_tenant_id, persons(given_name, family_name))")
      .eq("id", params.contractId)
      .maybeSingle();
    if (error || !contract || !contract.property_id || !contract.term_end) {
      console.error("notifyContractExpiry: contract not resolvable", params.contractId, error?.message);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tenancy: any = contract.tenancies;
    const person = tenancy?.persons;
    const tenantName = person ? `${person.given_name} ${person.family_name}` : "—";

    await notifyOwners({
      propertyId: contract.property_id,
      category: "contract",
      entityType: "contract",
      entityId: contract.id,
      build: (t) => ({
        subject: t("contractExpirySubject", { days: params.leadDays, tenant: tenantName }),
        body: t("contractExpiryBody", {
          days: params.leadDays,
          tenant: tenantName,
          date: contract.term_end as string,
        }),
      }),
    });
  } catch (err) {
    console.error("notifyContractExpiry: unexpected failure", err instanceof Error ? err.message : err);
  }
}
