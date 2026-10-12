"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { notifyMeterReadingRetake } from "@/server/notifications/notify-meter-reading-retake";

const RejectMeterReadingSchema = z.object({
  readingId: z.string().uuid(),
});

// "Ask for retake" in the admin verification UI. Owner-only:
// requireOwnerPersonId fails fast, RLS (owner_update_meter_readings)
// remains the real enforcement.
//
// No rejected_by/rejected_at columns exist on meter_readings (unlike
// confirmed_by/confirmed_at for verification) — accepted v1 audit-trail
// gap, not silently patched by repurposing the confirmed_* columns to
// mean something they don't.
export async function rejectMeterReading(input: { readingId: string }) {
  const parsed = RejectMeterReadingSchema.parse(input);
  const supabase = await createClient();
  await requireOwnerPersonId(supabase);

  const { data: rejected, error } = await supabase
    .from("meter_readings")
    .update({ status: "rejected" })
    .eq("id", parsed.readingId)
    .select("tenancy_id, meters(label)")
    .maybeSingle();
  if (error) throw new Error(error.message);

  // B-32: tell the tenant a retake is wanted (before this they only found
  // out by opening the meters page).
  if (rejected) {
    const meterRef = rejected.meters as unknown as { label: string } | { label: string }[] | null;
    const meter = Array.isArray(meterRef) ? meterRef[0] : meterRef;
    await notifyMeterReadingRetake({ tenancyId: rejected.tenancy_id, meterLabel: meter?.label ?? "—" });
  }
}
