"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const VerifyMeterReadingSchema = z.object({
  readingId: z.string().uuid(),
  confirmedValue: z.number(),
});

// No ≥previous constraint here — verification is the trusted correction
// point, unconstrained by design. This *is* how admin override actually
// happens for a genuinely bad tenant entry: verify a different value, no
// separate override flag needed at this step (see submit-meter-reading.ts
// for where the ≥previous check does apply, at entry time).
export async function verifyMeterReading(input: { readingId: string; confirmedValue: number }) {
  const parsed = VerifyMeterReadingSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data: callerProfile } = await supabase
    .from("profiles")
    .select("person_id")
    .eq("id", user.id)
    .single();
  if (!callerProfile?.person_id) throw new Error("Caller has no person record");

  // RLS (owner_update_meter_readings) enforces that only an owner can
  // reach this update — no manual role check needed.
  const { error } = await supabase
    .from("meter_readings")
    .update({
      confirmed_value: parsed.confirmedValue,
      confirmed_by: callerProfile.person_id,
      confirmed_at: new Date().toISOString(),
      status: "verified",
    })
    .eq("id", parsed.readingId);
  if (error) throw new Error(error.message);
}
