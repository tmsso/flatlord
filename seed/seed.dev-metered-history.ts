// B-30: give one DEV tenancy a metered history, so the tenant home's
// consumption mini-chart, metered statement rows and rate chips can be
// checked against real-shaped data on dev (until now every dev statement
// was fixed-charge only).
//
// For the tenancy of E2E_TENANT_EMAIL (default playwright-tenant-a):
//   1. one verified reading per active meter on the 28th of each month in
//      HISTORY_MONTHS (values climb from the meter's base value and stay
//      below any later verified reading);
//   2. a statement per month built by the real engine
//      (createDraftStatementCore), issued the way issue-statement.ts does
//      (due date in the following month), and paid in full by bank
//      transfer, so the tenant's current amount due is unaffected.
// Idempotent: a month that already has a statement, or a meter that
// already has a reading in that month, is skipped. Synthetic values only.
//
// Run (needs .env.local pointing at dev):
//   pnpm exec dotenv -e .env.local -- tsx --conditions=react-server seed/seed.dev-metered-history.ts
// `--conditions=react-server` lets the engine's `import "server-only"`
// resolve outside Next.
import { createClient } from "@supabase/supabase-js";
import { createDraftStatementCore } from "../src/server/billing/create-draft-statement-core";

const DEV_REF = "kqrzqbocruwafvuodatb";
const HISTORY_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
const TENANT_EMAIL = process.env.E2E_TENANT_EMAIL ?? "playwright-tenant-a@flatlord.test";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Fail closed: this writes readings and issued statements.
  if (!url.includes(DEV_REF)) throw new Error(`Refusing: ${url || "(unset)"} is not the dev project`);
  const supabase = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const user = users.users.find((u) => u.email === TENANT_EMAIL);
  if (!user) throw new Error(`${TENANT_EMAIL} not found on dev`);
  const { data: profile } = await supabase.from("profiles").select("person_id").eq("id", user.id).single();
  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id, unit_id, due_day, reminder_lead_days, primary_tenant_id")
    .eq("primary_tenant_id", profile!.person_id)
    .eq("status", "active")
    .single();
  if (!tenancy) throw new Error("no active tenancy");

  // The owner confirms readings and records payments, like the real flow.
  const { data: tenancyProperty } = await supabase.from("tenancies").select("property_id").eq("id", tenancy.id).single();
  const { data: ownership } = await supabase
    .from("property_ownership")
    .select("person_id")
    .eq("property_id", tenancyProperty!.property_id)
    .limit(1)
    .single();
  const ownerPersonId = ownership!.person_id as string;

  const { data: meters } = await supabase
    .from("meters")
    .select("id, label, base_value")
    .eq("unit_id", tenancy.unit_id)
    .is("removed_at", null);
  const { data: existingReadings } = await supabase
    .from("meter_readings")
    .select("meter_id, reading_date, confirmed_value")
    .eq("tenancy_id", tenancy.id);

  // Monthly consumption per meter, small and deterministic, kept below the
  // first later verified reading so the meter never runs backwards.
  for (const meter of meters ?? []) {
    const base = Number(meter.base_value);
    const later = (existingReadings ?? [])
      .filter((r) => r.meter_id === meter.id && r.confirmed_value != null && r.reading_date > "2026-06-30")
      .map((r) => Number(r.confirmed_value));
    const ceiling = later.length ? Math.min(...later) : base + 100;
    const step = Math.max(1, Math.floor((ceiling - base) / (HISTORY_MONTHS.length + 1)));
    for (const [i, month] of HISTORY_MONTHS.entries()) {
      const already = (existingReadings ?? []).some((r) => r.meter_id === meter.id && r.reading_date.startsWith(month));
      if (already) continue;
      // Wobble by one unit on odd months so the chart isn't a straight line.
      const value = base + step * (i + 1) + (i % 2);
      const { error } = await supabase.from("meter_readings").insert({
        meter_id: meter.id,
        tenancy_id: tenancy.id,
        reading_date: `${month}-28`,
        entered_value: value,
        confirmed_value: value,
        confirmed_by: ownerPersonId,
        confirmed_at: new Date().toISOString(),
        entered_by: tenancy.primary_tenant_id,
        status: "verified",
        source: "admin",
      });
      if (error) throw new Error(`reading ${meter.label} ${month}: ${error.message}`);
      console.log(`reading  ${month}  ${meter.label} = ${value}`);
    }
  }

  const { data: statements } = await supabase.from("statements").select("period_month").eq("tenancy_id", tenancy.id);
  for (const month of HISTORY_MONTHS) {
    const periodMonth = `${month}-01`;
    if ((statements ?? []).some((s) => s.period_month === periodMonth)) {
      console.log(`statement ${month}  exists, skipped`);
      continue;
    }
    const { statementId, warnings } = await createDraftStatementCore(supabase, { tenancyId: tenancy.id, periodMonth });
    // Same fields issue-statement.ts writes; due = due_day of the month
    // after the period (historical: the issue date is the period's end).
    const [y, m] = month.split("-").map(Number);
    const due = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-${String(tenancy.due_day).padStart(2, "0")}`;
    const { error } = await supabase
      .from("statements")
      .update({
        status: "issued",
        due_date: due,
        issued_at: new Date(`${month}-28T12:00:00Z`).toISOString(),
        issued_snapshot: {
          dueDay: tenancy.due_day,
          reminderLeadDays: tenancy.reminder_lead_days,
          tenancyId: tenancy.id,
          primaryTenantId: tenancy.primary_tenant_id,
        },
      })
      .eq("id", statementId);
    if (error) throw new Error(`issue ${month}: ${error.message}`);

    const { data: issued } = await supabase.from("statements").select("total, currency").eq("id", statementId).single();
    const { error: payError } = await supabase.from("payments").insert({
      statement_id: statementId,
      amount: issued!.total,
      currency: issued!.currency,
      paid_at: due,
      method: "bank_transfer",
      note: "B-30 dev seed",
      recorded_by: ownerPersonId,
    });
    if (payError) throw new Error(`payment ${month}: ${payError.message}`);
    // The status-recompute trigger (migration 0008) moves it to 'paid'.
    const { data: after } = await supabase.from("statements").select("status").eq("id", statementId).single();
    if (after!.status !== "paid") throw new Error(`${month}: expected paid after full payment, got ${after!.status}`);
    console.log(`statement ${month}  issued + paid ${issued!.total}${warnings.length ? ` (warnings: ${warnings.join("; ")})` : ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
