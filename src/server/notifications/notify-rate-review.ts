import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyOwners } from "@/server/notifications/notify-owners";

// "A fixed charge rate is scheduled to end in N days — set the next one"
// owner alert (ROADMAP Phase 4 lead-reminder batch). Fires
// reminder_lead_days.rateReview days (default 30) before a
// charge_schedules.valid_to on a fixed-kind charge (rent, common cost,
// internet). Fired by the daily cron. Best-effort, never throws.
export async function notifyRateReview(params: { chargeScheduleId: string; leadDays: number }) {
  try {
    const service = createServiceRoleClient();
    const { data: schedule, error } = await service
      .from("charge_schedules")
      .select("id, property_id, valid_to, tenancy_id, charge_types(name, code)")
      .eq("id", params.chargeScheduleId)
      .maybeSingle();
    if (error || !schedule || !schedule.property_id || !schedule.valid_to) {
      console.error("notifyRateReview: schedule not resolvable", params.chargeScheduleId, error?.message);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chargeType: any = schedule.charge_types;
    const chargeLabel = chargeType?.name ?? chargeType?.code ?? "—";

    const { data: tenancy } = await service
      .from("tenancies")
      .select("primary_tenant_id, persons(given_name, family_name)")
      .eq("id", schedule.tenancy_id)
      .maybeSingle();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const person: any = tenancy?.persons;
    const tenantName = person ? `${person.given_name} ${person.family_name}` : "—";

    await notifyOwners({
      propertyId: schedule.property_id,
      category: "rate_review",
      entityType: "charge_schedule",
      entityId: schedule.id,
      build: (t) => ({
        subject: t("rateReviewSubject", { charge: chargeLabel, tenant: tenantName }),
        body: t("rateReviewBody", {
          charge: chargeLabel,
          tenant: tenantName,
          days: params.leadDays,
          date: schedule.valid_to as string,
        }),
      }),
    });
  } catch (err) {
    console.error("notifyRateReview: unexpected failure", err instanceof Error ? err.message : err);
  }
}
