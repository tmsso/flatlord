import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isPaymentDueReminderDay,
  isOverdue,
  resolvePaymentDueLeadDays,
  shouldSendOverdueAlert,
  type StatementStatus,
} from "@/server/reminders/compute-due-reminders";
import {
  isLeadReminderDay,
  isMeterReadingReminderDay,
  isMonthlyMeterReading,
  matchedLeadDays,
  resolveContractExpiryLeadDays,
  resolveInventoryActionByLeadDays,
  resolveMeterReadingLeadDays,
  resolveMeterReadingWindowStartDay,
  resolveRateReviewLeadDays,
  hasLaterSchedule,
} from "@/server/reminders/compute-lead-reminders";
import { notifyPaymentDueReminder } from "@/server/notifications/notify-payment-due-reminder";
import { notifyOverdueStatement } from "@/server/notifications/notify-overdue-statement";
import { notifyMeterReadingReminder } from "@/server/notifications/notify-meter-reading-reminder";
import { notifyContractExpiry } from "@/server/notifications/notify-contract-expiry";
import { notifyRateReview } from "@/server/notifications/notify-rate-review";
import { notifyInventoryActionBy } from "@/server/notifications/notify-inventory-action-by";
import { runStatementAutoDraft } from "@/server/reminders/run-statement-auto-draft";
import { runScheduledReconfirmation } from "@/server/reminders/run-scheduled-reconfirmation";
import { startCronRun } from "@/server/reminders/cron-run-log";
import { createPropertyModuleLookup } from "@/server/modules/get-modules";
import type { OptionalModule } from "@/lib/modules";

export const runtime = "nodejs";

// The single daily Vercel Cron target (vercel.json, 07:00 UTC). Public
// route — excluded from the auth-gating proxy matcher, same as api/health
// — with CRON_SECRET as its own bearer-token auth (Vercel's documented
// cron-security pattern). If CRON_SECRET isn't set, every request is
// rejected (fail-closed), not silently unauthenticated.
//
// ROADMAP Phase 4. Batches so far: payment-due reminders + overdue
// detection; then four lead-time reminder shapes (meter-reading-window
// nudge, contract-expiry, fixed-charge rate-review, inventory action_by);
// then statement auto-draft on month close (runStatementAutoDraft) plus a
// retroactive-issue grace on the overdue rule; and now the last shape —
// scheduled inventory-reconfirmation triggers (runScheduledReconfirmation),
// which unlike the others create campaign rows, opt-in per tenancy via
// reminder_lead_days.reconfirmation.intervalMonths. Every deferred cron
// shape from ROADMAP Phase 4 is now shipped.
//
// Every notify-*.ts call is best-effort/never-throws. The lead-time and
// payment-due predicates fire on exactly one calendar day, so their
// per-day idempotency guard only has to defend against a same-day manual
// re-trigger. The overdue alert is different: "overdue" stays true every
// day after the due date, so it is guarded per statement, not per day —
// it fires once, when the statement first goes overdue (B-50 hotfix,
// 2026-10-15; before that it re-sent every unpaid statement daily).
//
// Each phase logs its duration and is recorded in cron_runs (B-50):
// Hobby keeps runtime logs ~30 min, so the run row — 'running' until the
// last phase, with every completed phase listed — is the durable clue to
// where a timed-out run stalled. The health check alerts on it.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  // Vercel Cron identifies itself by user agent. Manual triggers (curl,
  // the owner testing) are logged under their own job name so the health
  // check — which reads only "daily-reminders" — judges scheduled runs.
  const scheduled = request.headers.get("user-agent")?.startsWith("vercel-cron/") ?? false;
  const runLog = await startCronRun(service, scheduled ? "daily-reminders" : "daily-reminders:manual");
  const timed = async <T,>(phase: string, run: () => Promise<T>): Promise<T> => {
    const started = Date.now();
    console.log("daily-reminders: phase start", phase);
    const result = await run();
    const ms = Date.now() - started;
    console.log("daily-reminders: phase done", phase, `${ms} ms`, JSON.stringify(result));
    await runLog.phaseDone({ phase, ms, result });
    return result;
  };

  try {
    const moduleOn = createModuleCheck(service);
    const statements = await timed("statements", () => runStatementReminders(service, today, moduleOn));
    const leadReminders = await timed("leadReminders", () => runLeadReminders(service, today, moduleOn));
    // Billing is core (no switch): auto-draft always runs.
    const autoDraft = await timed("autoDraft", () => runStatementAutoDraft(service, today));
    const reconfirmation = await timed("reconfirmation", () =>
      runScheduledReconfirmation(service, today, (propertyId) => moduleOn(propertyId, "inventory")),
    );
    await runLog.finish("ok");
    return NextResponse.json({ ok: true, ...statements, ...leadReminders, ...autoDraft, ...reconfirmation });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("daily-reminders: run failed", message);
    await runLog.finish("failed", message);
    return NextResponse.json({ ok: false, error: "run failed" }, { status: 500 });
  }
}

// B-45 / D-33: reminders are the "notifications" module (inventory
// reminders also need "inventory"); a property's module is on if any of its
// owners has it on. A failed lookup keeps the pre-switch behaviour (send)
// and logs — a broken settings read must not silently stop reminders.
type ModuleCheck = (propertyId: string | null, module: OptionalModule) => Promise<boolean>;
function createModuleCheck(service: SupabaseClient): ModuleCheck {
  const lookup = createPropertyModuleLookup(service);
  return async (propertyId, module) => {
    if (!propertyId) return true;
    try {
      return (await lookup(propertyId)).has(module);
    } catch (err) {
      console.error("daily-reminders: module lookup failed, assuming on", propertyId, err instanceof Error ? err.message : err);
      return true;
    }
  };
}

// Has an in-app notification row for this entity+category already been
// written today? Guards against a same-day retry/manual re-trigger.
async function alreadyNotifiedToday(
  service: SupabaseClient,
  entityType: string,
  entityId: string,
  category: string,
  today: string,
): Promise<boolean> {
  const { data } = await service
    .from("notifications")
    .select("id")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("category", category)
    .gte("created_at", `${today}T00:00:00Z`)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// --- payment-due + overdue (first cron batch, unchanged behaviour) ------
async function runStatementReminders(service: SupabaseClient, today: string, moduleOn: ModuleCheck) {
  const { data: statements, error } = await service
    .from("statements")
    .select("id, tenancy_id, property_id, status, due_date, issued_at")
    .in("status", ["issued", "partially_paid"])
    .not("due_date", "is", null);
  if (error) {
    console.error("daily-reminders: failed to load statements", error.message);
    return { statementsChecked: 0, remindersSent: 0, overdueAlertsSent: 0 };
  }

  let remindersSent = 0;
  let overdueAlertsSent = 0;

  for (const statement of statements ?? []) {
    if (!statement.due_date) continue;
    if (!(await moduleOn(statement.property_id, "notifications"))) continue;

    const { data: tenancy } = await service
      .from("tenancies")
      .select("reminder_lead_days")
      .eq("id", statement.tenancy_id)
      .maybeSingle();
    const leadDays = resolvePaymentDueLeadDays(tenancy?.reminder_lead_days);

    // No date floor: "overdue" is checked against every earlier alert for
    // this statement, "amount_due" only against today's.
    const { data: existing } = await service
      .from("notifications")
      .select("category, created_at")
      .eq("entity_type", "statement")
      .eq("entity_id", statement.id)
      .in("category", ["amount_due", "overdue"]);
    const amountDueSentToday = (existing ?? []).some(
      (n) => n.category === "amount_due" && n.created_at >= `${today}T00:00:00Z`,
    );
    const overdueEverAlerted = (existing ?? []).some((n) => n.category === "overdue");

    if (!amountDueSentToday && isPaymentDueReminderDay(statement.due_date, leadDays, today)) {
      await notifyPaymentDueReminder({ statementId: statement.id });
      remindersSent++;
    }

    if (
      shouldSendOverdueAlert(
        isOverdue(statement.status as StatementStatus, statement.due_date, today, statement.issued_at),
        overdueEverAlerted,
      )
    ) {
      await notifyOverdueStatement({ statementId: statement.id });
      overdueAlertsSent++;
    }
  }

  return { statementsChecked: statements?.length ?? 0, remindersSent, overdueAlertsSent };
}

// --- meter-reading / contract-expiry / rate-review / inventory action_by
async function runLeadReminders(service: SupabaseClient, today: string, moduleOn: ModuleCheck) {
  let meterReadingReminders = 0;
  let contractExpiryAlerts = 0;
  let rateReviewAlerts = 0;
  let inventoryActionByAlerts = 0;

  const { data: tenancies } = await service
    .from("tenancies")
    .select("id, property_id, reminder_lead_days, meter_reading_config")
    .eq("status", "active");
  const activeTenancies = tenancies ?? [];
  // property_id -> a reminder_lead_days jsonb (first active tenancy on
  // that property); used for property-scoped entities (inventory items)
  // that have no tenancy of their own.
  const leadByProperty = new Map<string, unknown>();
  for (const t of activeTenancies) {
    if (t.property_id && !leadByProperty.has(t.property_id)) {
      leadByProperty.set(t.property_id, t.reminder_lead_days);
    }
  }

  // 1. meter-reading-window nudge — per active tenancy, to the tenant
  for (const tenancy of activeTenancies) {
    if (!isMonthlyMeterReading(tenancy.meter_reading_config)) continue;
    if (!(await moduleOn(tenancy.property_id, "notifications"))) continue;
    const windowStartDay = resolveMeterReadingWindowStartDay(tenancy.meter_reading_config);
    const leadDays = resolveMeterReadingLeadDays(tenancy.reminder_lead_days);
    if (!isMeterReadingReminderDay(windowStartDay, leadDays, today)) continue;
    if (await alreadyNotifiedToday(service, "tenancy", tenancy.id, "meter_reading", today)) continue;
    await notifyMeterReadingReminder({ tenancyId: tenancy.id });
    meterReadingReminders++;
  }

  // 2. contract-expiry — per active contract, to owners, one per lead value
  const { data: contracts } = await service
    .from("contracts")
    .select("id, tenancy_id, property_id, term_end")
    .eq("status", "active")
    .not("term_end", "is", null);
  const leadByTenancy = new Map(activeTenancies.map((t) => [t.id, t.reminder_lead_days]));
  for (const contract of contracts ?? []) {
    if (!contract.term_end) continue;
    if (!(await moduleOn(contract.property_id, "notifications"))) continue;
    const leads = resolveContractExpiryLeadDays(leadByTenancy.get(contract.tenancy_id));
    const matched = matchedLeadDays(contract.term_end, leads, today);
    if (matched == null) continue;
    if (await alreadyNotifiedToday(service, "contract", contract.id, "contract", today)) continue;
    await notifyContractExpiry({ contractId: contract.id, leadDays: matched });
    contractExpiryAlerts++;
  }

  // 3. fixed-charge rate-review — per fixed charge_schedule with a valid_to
  const { data: schedules } = await service
    .from("charge_schedules")
    .select("id, tenancy_id, charge_type_id, property_id, valid_from, valid_to, charge_types!inner(kind)")
    .eq("charge_types.kind", "fixed");
  for (const schedule of schedules ?? []) {
    if (!schedule.valid_to) continue;
    // Already followed by a scheduled change → nothing to review.
    if (hasLaterSchedule(schedule, schedules ?? [])) continue;
    if (!(await moduleOn(schedule.property_id, "notifications"))) continue;
    const lead = resolveRateReviewLeadDays(leadByTenancy.get(schedule.tenancy_id));
    if (!isLeadReminderDay(schedule.valid_to, lead, today)) continue;
    if (await alreadyNotifiedToday(service, "charge_schedule", schedule.id, "rate_review", today)) continue;
    await notifyRateReview({ chargeScheduleId: schedule.id, leadDays: lead });
    rateReviewAlerts++;
  }

  // 4. inventory action_by — per active item with an action_by_date, to owners
  const { data: items } = await service
    .from("inventory_items")
    .select("id, property_id, action_by_date")
    .eq("status", "active")
    .not("action_by_date", "is", null);
  for (const item of items ?? []) {
    if (!item.action_by_date) continue;
    if (!(await moduleOn(item.property_id, "notifications")) || !(await moduleOn(item.property_id, "inventory"))) continue;
    const lead = resolveInventoryActionByLeadDays(leadByProperty.get(item.property_id));
    if (!isLeadReminderDay(item.action_by_date, lead, today)) continue;
    if (await alreadyNotifiedToday(service, "inventory_item", item.id, "inventory", today)) continue;
    await notifyInventoryActionBy({ inventoryItemId: item.id, leadDays: lead });
    inventoryActionByAlerts++;
  }

  return { meterReadingReminders, contractExpiryAlerts, rateReviewAlerts, inventoryActionByAlerts };
}
