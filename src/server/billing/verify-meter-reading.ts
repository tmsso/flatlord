"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";

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

  // Fails fast for a non-owner and resolves confirmed_by (a persons.id).
  const { personId } = await requireOwnerPersonId(supabase);

  // RLS (owner_update_meter_readings) remains the real enforcement.
  const { error } = await supabase
    .from("meter_readings")
    .update({
      confirmed_value: parsed.confirmedValue,
      confirmed_by: personId,
      confirmed_at: new Date().toISOString(),
      status: "verified",
    })
    .eq("id", parsed.readingId);
  if (error) throw new Error(error.message);
}
