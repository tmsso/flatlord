import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isPaymentDueReminderDay,
  isOverdue,
  resolvePaymentDueLeadDays,
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
} from "@/server/reminders/compute-lead-reminders";
import { notifyPaymentDueReminder } from "@/server/notifications/notify-payment-due-reminder";
import { notifyOverdueStatement } from "@/server/notifications/notify-overdue-statement";
import { notifyMeterReadingReminder } from "@/server/notifications/notify-meter-reading-reminder";
import { notifyContractExpiry } from "@/server/notifications/notify-contract-expiry";
import { notifyRateReview } from "@/server/notifications/notify-rate-review";
import { notifyInventoryActionBy } from "@/server/notifications/notify-inventory-action-by";
import { runStatementAutoDraft } from "@/server/reminders/run-statement-auto-draft";

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
// then this one — statement auto-draft on month close (runStatementAutoDraft
// below), plus a retroactive-issue grace on the overdue rule so a
// freshly-issued statement no longer trips a false alert the same day.
// Still deferred: scheduled inventory-reconfirmation *triggers* (they
// create campaign rows, not just notifications — their own piece).
//
// Every notify-*.ts call is best-effort/never-throws; every reminder
// predicate fires on exactly one calendar day, so the per-day
// idempotency guard below only has to defend against a same-day manual
// re-trigger, matching the original statement loop's approach.

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const statements = await runStatementReminders(service, today);
  const leadReminders = await runLeadReminders(service, today);
  const autoDraft = await runStatementAutoDraft(service, today);

  return NextResponse.json({ ok: true, ...statements, ...leadReminders, ...autoDraft });
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
async function runStatementReminders(service: SupabaseClient, today: string) {
  const { data: statements, error } = await service
    .from("statements")
    .select("id, tenancy_id, status, due_date, issued_at")
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

    const { data: tenancy } = await service
      .from("tenancies")
      .select("reminder_lead_days")
      .eq("id", statement.tenancy_id)
      .maybeSingle();
    const leadDays = resolvePaymentDueLeadDays(tenancy?.reminder_lead_days);

    const { data: existing } = await service
      .from("notifications")
      .select("category")
      .eq("entity_type", "statement")
      .eq("entity_id", statement.id)
      .in("category", ["amount_due", "overdue"])
      .gte("created_at", `${today}T00:00:00Z`);
    const alreadySent = new Set((existing ?? []).map((n) => n.category));

    if (!alreadySent.has("amount_due") && isPaymentDueReminderDay(statement.due_date, leadDays, today)) {
      await notifyPaymentDueReminder({ statementId: statement.id });
      remindersSent++;
    }

    if (
      !alreadySent.has("overdue") &&
      isOverdue(statement.status as StatementStatus, statement.due_date, today, statement.issued_at)
    ) {
      await notifyOverdueStatement({ statementId: statement.id });
      overdueAlertsSent++;
    }
  }

  return { statementsChecked: statements?.length ?? 0, remindersSent, overdueAlertsSent };
}

// --- meter-reading / contract-expiry / rate-review / inventory action_by
async function runLeadReminders(service: SupabaseClient, today: string) {
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
    .select("id, tenancy_id, term_end")
    .eq("status", "active")
    .not("term_end", "is", null);
  const leadByTenancy = new Map(activeTenancies.map((t) => [t.id, t.reminder_lead_days]));
  for (const contract of contracts ?? []) {
    if (!contract.term_end) continue;
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
    .select("id, tenancy_id, valid_to, charge_types!inner(kind)")
    .eq("charge_types.kind", "fixed")
    .not("valid_to", "is", null);
  for (const schedule of schedules ?? []) {
    if (!schedule.valid_to) continue;
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
    const lead = resolveInventoryActionByLeadDays(leadByProperty.get(item.property_id));
    if (!isLeadReminderDay(item.action_by_date, lead, today)) continue;
    if (await alreadyNotifiedToday(service, "inventory_item", item.id, "inventory", today)) continue;
    await notifyInventoryActionBy({ inventoryItemId: item.id, leadDays: lead });
    inventoryActionByAlerts++;
  }

  return { meterReadingReminders, contractExpiryAlerts, rateReviewAlerts, inventoryActionByAlerts };
}
