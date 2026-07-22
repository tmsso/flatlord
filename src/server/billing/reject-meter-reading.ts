"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const RejectMeterReadingSchema = z.object({
  readingId: z.string().uuid(),
});

// "Ask for retake" in the admin verification UI. RLS (owner_update_meter_
// readings) enforces that only an owner can reach this update — no manual
// role check needed, mirroring verify-meter-reading.ts.
//
// No rejected_by/rejected_at columns exist on meter_readings (unlike
// confirmed_by/confirmed_at for verification) — accepted v1 audit-trail
// gap, not silently patched by repurposing the confirmed_* columns to
// mean something they don't.
export async function rejectMeterReading(input: { readingId: string }) {
  const parsed = RejectMeterReadingSchema.parse(input);
  const supabase = await createClient();

  const { error } = await supabase
    .from("meter_readings")
    .update({ status: "rejected" })
    .eq("id", parsed.readingId);
  if (error) throw new Error(error.message);
}
