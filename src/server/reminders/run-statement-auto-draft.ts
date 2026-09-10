import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDraftStatementCore } from "@/server/billing/create-draft-statement-core";
import { notifyStatementDrafted } from "@/server/notifications/notify-statement-drafted";
import { notifyStatementDraftBlocked } from "@/server/notifications/notify-statement-draft-blocked";
import {
  assessAutoDraftReadiness,
  isPastAutoDraftGraceDay,
  nextPeriodStart,
  previousPeriodMonth,
  type AutoDraftMeter,
  type AutoDraftReading,
} from "@/server/reminders/compute-autodraft";

// The daily cron's statement auto-draft pass (ROADMAP Phase 4a). For each
// active tenancy, for the just-closed calendar month:
//   - already has a statement row for that period  -> nothing to do
//   - every meter active in the period has a verified in-period reading
//                                                   -> create the draft, alert the owner
//   - readings still missing, and the month is past its grace day
//                                                   -> one "couldn't draft" owner alert
//   - readings still missing, still within grace    -> stay quiet, try again tomorrow
//
// Trust rule: this INSERTs `statements` rows autonomously, always in
// `draft` status — it never issues. Issuing stays a deliberate one-click
// admin action on the statement detail page.
//
// Best-effort throughout: a failure on one tenancy is logged and the loop
// continues, matching every notify-*.ts in this cron.
export async function runStatementAutoDraft(service: SupabaseClient, today: string) {
  const period = previousPeriodMonth(today);
  const monthAfterPeriod = nextPeriodStart(period); // == first day of the current month

  let draftsCreated = 0;
  let draftBlockedAlerts = 0;

  const { data: tenancies, error } = await service
    .from("tenancies")
    .select("id, unit_id")
    .eq("status", "active");
  if (error) {
    console.error("runStatementAutoDraft: failed to load tenancies", error.message);
    return { autoDraftTenancies: 0, draftsCreated, draftBlockedAlerts };
  }

  for (const tenancy of tenancies ?? []) {
    try {
      const { data: existing } = await service
        .from("statements")
        .select("id")
        .eq("tenancy_id", tenancy.id)
        .eq("period_month", period)
        .maybeSingle();
      if (existing) continue;

      const { data: meterRows } = await service
        .from("meters")
        .select("id, label, installed_at, removed_at")
        .eq("unit_id", tenancy.unit_id);
      const meters: AutoDraftMeter[] = (meterRows ?? []).map((m) => ({
        id: m.id as string,
        label: m.label as string,
        installedAt: m.installed_at as string,
        removedAt: (m.removed_at as string | null) ?? null,
      }));

      const meterIds = meters.map((m) => m.id);
      const { data: readingRows } = meterIds.length
        ? await service
            .from("meter_readings")
            .select("meter_id, reading_date, status")
            .in("meter_id", meterIds)
        : { data: [] };
      const readings: AutoDraftReading[] = (readingRows ?? []).map((r) => ({
        meterId: r.meter_id as string,
        readingDate: r.reading_date as string,
        status: r.status as string,
      }));

      const readiness = assessAutoDraftReadiness(period, meters, readings);

      if (readiness.ready) {
        const { statementId } = await createDraftStatementCore(service, {
          tenancyId: tenancy.id,
          periodMonth: period,
        });
        await notifyStatementDrafted({ statementId });
        draftsCreated++;
        continue;
      }

      if (!isPastAutoDraftGraceDay(today)) continue;

      const { data: alreadyBlocked } = await service
        .from("notifications")
        .select("id")
        .eq("entity_type", "tenancy")
        .eq("entity_id", tenancy.id)
        .eq("category", "statement_draft_blocked")
        .gte("created_at", `${monthAfterPeriod}T00:00:00Z`)
        .limit(1);
      if ((alreadyBlocked?.length ?? 0) > 0) continue;

      await notifyStatementDraftBlocked({
        tenancyId: tenancy.id,
        periodMonth: period,
        missingMeterLabels: readiness.missingMeterLabels,
      });
      draftBlockedAlerts++;
    } catch (err) {
      console.error(
        "runStatementAutoDraft: tenancy failed",
        tenancy.id,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return { autoDraftTenancies: tenancies?.length ?? 0, draftsCreated, draftBlockedAlerts };
}
