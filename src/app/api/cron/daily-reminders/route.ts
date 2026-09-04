import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { isPaymentDueReminderDay, isOverdue, resolvePaymentDueLeadDays, type StatementStatus } from "@/server/reminders/compute-due-reminders";
import { notifyPaymentDueReminder } from "@/server/notifications/notify-payment-due-reminder";
import { notifyOverdueStatement } from "@/server/notifications/notify-overdue-statement";

export const runtime = "nodejs";

// ROADMAP Phase 4 item 1, scoped to payment-due reminders + overdue
// detection this batch (see ROADMAP for the deferred remainder: meter-
// reading, contract-expiry/rent-review, inventory action_by, scheduled
// reconfirmation triggers). Configured as a daily Vercel Cron target in
// vercel.json. Public route (excluded from the auth-gating proxy matcher,
// same as api/health) — CRON_SECRET is this route's own auth instead,
// matching Vercel's documented cron-security pattern. If CRON_SECRET
// isn't set, every request is rejected (fail-closed), not silently
// unauthenticated.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = createServiceRoleClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: statements, error } = await service
    .from("statements")
    .select("id, tenancy_id, status, due_date")
    .in("status", ["issued", "partially_paid"])
    .not("due_date", "is", null);
  if (error) {
    console.error("daily-reminders: failed to load statements", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    // Idempotency: the cron runs once daily but must survive a manual
    // re-trigger/retry on the same day without double-sending — skip a
    // category already notified for this statement today.
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

    if (!alreadySent.has("overdue") && isOverdue(statement.status as StatementStatus, statement.due_date, today)) {
      await notifyOverdueStatement({ statementId: statement.id });
      overdueAlertsSent++;
    }
  }

  return NextResponse.json({ ok: true, checked: statements?.length ?? 0, remindersSent, overdueAlertsSent });
}
