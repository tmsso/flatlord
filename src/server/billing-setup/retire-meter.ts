"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { BILLING_SETUP_ERRORS, type BillingSetupResult } from "@/lib/billing/charge-presets";

const RetireMeterSchema = z.object({
  meterId: z.string().uuid(),
  removedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateRequired"),
});

// Takes a meter out of service from a date (removed_at). The billing
// engine and auto-draft already treat a meter as active only between
// installed_at and removed_at. Never deletes: readings and issued
// statements keep pointing at it. A replacement is "retire + add a new
// meter with its own base value"; linking the two (replaces_meter_id) and
// the cross-meter delta are a separate backlog item.
export async function retireMeter(input: z.infer<typeof RetireMeterSchema>): Promise<BillingSetupResult> {
  const parsed = RetireMeterSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: meter, error: meterError } = await supabase
    .from("meters")
    .select("id, unit_id, installed_at, removed_at")
    .eq("id", parsed.meterId)
    .single();
  if (meterError) throw new Error(meterError.message);
  if (parsed.removedAt < meter.installed_at) return { ok: false, error: BILLING_SETUP_ERRORS.removedBeforeInstalled };

  const { data: later, error: laterError } = await supabase
    .from("meter_readings")
    .select("id")
    .eq("meter_id", parsed.meterId)
    .gt("reading_date", parsed.removedAt)
    .neq("status", "rejected")
    .limit(1);
  if (laterError) throw new Error(laterError.message);
  if (later?.length) return { ok: false, error: BILLING_SETUP_ERRORS.readingsAfterRemoval };

  const { error } = await supabase.from("meters").update({ removed_at: parsed.removedAt }).eq("id", parsed.meterId);
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "property",
    entityId: meter.unit_id,
    actorId: personId,
    action: "meter_retire",
    before: { meterId: meter.id, removedAt: meter.removed_at },
    after: { meterId: meter.id, removedAt: parsed.removedAt },
  });
  return { ok: true };
}
