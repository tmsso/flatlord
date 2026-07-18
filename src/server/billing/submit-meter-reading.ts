"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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
  // reading, falling back to its baseValue if none exists.
  const { data: previousRows, error: previousError } = await supabase
    .from("meter_readings")
    .select("confirmed_value")
    .eq("meter_id", parsed.meterId)
    .eq("status", "verified")
    .order("reading_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (previousError) throw new Error(previousError.message);

  let previousValue: number;
  const previous = previousRows?.[0];
  if (previous?.confirmed_value != null) {
    // Number()-wrap explicitly — PostgREST can return numeric columns as
    // strings, and JS `<` on two strings is lexicographic, not numeric.
    previousValue = Number(previous.confirmed_value);
  } else {
    const { data: meter, error: meterError } = await supabase
      .from("meters")
      .select("base_value")
      .eq("id", parsed.meterId)
      .single();
    if (meterError) throw new Error(meterError.message);
    previousValue = Number(meter.base_value);
  }

  if (parsed.enteredValue < previousValue) {
    const isOwner = callerProfile.role === "owner";
    if (!isOwner || !parsed.override) {
      throw new Error(
        `New reading (${parsed.enteredValue}) is lower than the previous verified reading (${previousValue}).` +
          (isOwner
            ? " Pass override: true to confirm this is expected (e.g. meter replacement)."
            : " Tenants cannot override this — contact the property owner if this is expected."),
      );
    }
  }

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
