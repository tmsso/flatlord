"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { evaluateMeterReadingEntry } from "@/lib/billing/evaluate-meter-reading-entry";

const SubmitMeterReadingSchema = z.object({
  meterId: z.string().uuid(),
  tenancyId: z.string().uuid(),
  readingDate: z.string(),
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
}) {
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
  if (!evaluation.allowed) throw new Error(evaluation.reason);

  const { error } = await supabase.from("meter_readings").insert({
    meter_id: parsed.meterId,
    tenancy_id: parsed.tenancyId,
    reading_date: parsed.readingDate,
    entered_value: parsed.enteredValue,
    entered_by: callerProfile.person_id,
    photo_path: parsed.photoPath ?? null,
    status: "submitted",
    source: callerProfile.role === "owner" ? "admin" : "tenant",
  });
  if (error) throw new Error(error.message);
}
