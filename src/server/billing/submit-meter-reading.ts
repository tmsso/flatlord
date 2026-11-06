"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluateMeterReadingEntry } from "@/lib/billing/evaluate-meter-reading-entry";
import { fail, type ActionResult } from "@/lib/action-result";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { billableReadingDate } from "@/lib/billing/meter-replacement";
import { logAudit } from "@/server/audit/log";

const SubmitMeterReadingSchema = z.object({
  meterId: z.string().uuid(),
  tenancyId: z.string().uuid(),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  enteredValue: z.number(),
  photoPath: z.string().optional(),
  override: z.boolean().default(false),
});

// The ≥previous validation and the tenant/admin override split (CLAUDE.md
// §3.4: "typed value entry per meter with ≥previous validation, admin can
// override") is genuine business logic, not authorization — RLS
// (tenant_insert_meter_readings / owner_insert_meter_readings) still
// separately enforces who can insert into which tenancy/meter. The
// caller's role is resolved server-side from `profiles.role`, never
// trusted from client input, so a tenant client cannot self-report as
// admin to unlock the override.
export async function submitMeterReading(input: {
  meterId: string;
  tenancyId: string;
  readingDate: string;
  enteredValue: number;
  photoPath?: string;
  override?: boolean;
}): Promise<ActionResult<{ redatedTo?: string }>> {
  const parsed = SubmitMeterReadingSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("person_id, role")
    .eq("id", user.id)
    .single();
  if (!callerProfile?.person_id) throw new Error("Caller has no person record");

  // Billable value is always confirmedValue, never enteredValue — the
  // ≥previous check compares against the meter's own latest *verified*
  // reading, falling back to its baseValue if none exists. The raw query
  // result is passed through unconverted — evaluateMeterReadingEntry owns
  // the numeric coercion (PostgREST can return numeric columns as
  // strings; see that module for why this matters).
  const { data: previousRows, error: previousError } = await supabase
    .from("meter_readings")
    .select("confirmed_value")
    .eq("meter_id", parsed.meterId)
    .eq("status", "verified")
    .order("reading_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (previousError) throw new Error(previousError.message);

  let previousValue: number | string;
  const previous = previousRows?.[0];
  if (previous?.confirmed_value != null) {
    previousValue = previous.confirmed_value;
  } else {
    const { data: meter, error: meterError } = await supabase
      .from("meters")
      .select("base_value")
      .eq("id", parsed.meterId)
      .single();
    if (meterError) throw new Error(meterError.message);
    previousValue = meter.base_value;
  }

  const evaluation = evaluateMeterReadingEntry({
    enteredValue: parsed.enteredValue,
    previousValue,
    callerRole: callerProfile.role,
    override: parsed.override,
  });
  // The English reason stays in the server log; the client gets a code.
  if (!evaluation.allowed) return fail("readingBelowPrevious");

  // B-55: move a reading dated in an already-drafted/issued month (or
  // before its meter's installation) to the first open date, so its
  // consumption lands on the next draft instead of being lost. The tenancy
  // read goes through the caller's RLS (proves access); the statement
  // months come from the service-role client because tenants can't see
  // draft statements (B-26) — a read-only lookup scoped to that unit.
  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("unit_id")
    .eq("id", parsed.tenancyId)
    .single();
  if (tenancyError) throw new Error(tenancyError.message);
  const admin = createServiceRoleClient();
  const [meterRes, unitTenanciesRes] = await Promise.all([
    admin.from("meters").select("installed_at, unit_id").eq("id", parsed.meterId).single(),
    admin.from("tenancies").select("id").eq("unit_id", tenancy.unit_id),
  ]);
  if (meterRes.error) throw new Error(meterRes.error.message);
  if (unitTenanciesRes.error) throw new Error(unitTenanciesRes.error.message);
  if (meterRes.data.unit_id !== tenancy.unit_id) throw new Error("Meter is not on this tenancy's unit");
  const { data: statements, error: statementsError } = await admin
    .from("statements")
    .select("period_month")
    .in("tenancy_id", (unitTenanciesRes.data ?? []).map((t) => t.id))
    .is("voided_at", null);
  if (statementsError) throw new Error(statementsError.message);
  const readingDate = billableReadingDate({
    readingDate: parsed.readingDate,
    installedAt: (meterRes.data.installed_at as string | null) ?? null,
    statementMonths: (statements ?? []).map((s) => s.period_month as string),
  });

  const { data: inserted, error } = await supabase.from("meter_readings").insert({
    meter_id: parsed.meterId,
    tenancy_id: parsed.tenancyId,
    reading_date: readingDate,
    entered_value: parsed.enteredValue,
    entered_by: callerProfile.person_id,
    photo_path: parsed.photoPath ?? null,
    status: "submitted",
    source: callerProfile.role === "owner" ? "admin" : "tenant",
  }).select("id").single();
  if (error) throw new Error(error.message);
  if (readingDate === parsed.readingDate) return { ok: true };
  await logAudit(supabase, {
    entityType: "meter_reading",
    entityId: inserted.id,
    actorId: callerProfile.person_id,
    action: "reading_redate",
    before: { readingDate: parsed.readingDate },
    after: { readingDate },
  });
  return { ok: true, redatedTo: readingDate };
}
