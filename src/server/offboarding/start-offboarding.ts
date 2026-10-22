"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { fail, type ActionResult } from "@/lib/action-result";
import { OFFBOARDING_STARTED } from "@/server/offboarding/load-offboarding";

const StartOffboardingSchema = z.object({
  tenancyId: z.string().uuid(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// B-43: records the move-out date. The tenancy keeps status "active" until
// the last checklist step ends it; term_end is set now so every screen
// shows the real end date. Re-running corrects the date (latest row wins).
export async function startOffboarding(input: z.infer<typeof StartOffboardingSchema>): Promise<ActionResult> {
  const parsed = StartOffboardingSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: tenancy, error: readError } = await supabase
    .from("tenancies")
    .select("id, status, term_start, term_end")
    .eq("id", parsed.tenancyId)
    .single();
  if (readError) throw new Error(readError.message);
  if (tenancy.status !== "active") return fail("tenancyNotActive");
  if (parsed.endDate < tenancy.term_start) return fail("endBeforeStart");

  const { error } = await supabase.from("tenancies").update({ term_end: parsed.endDate }).eq("id", parsed.tenancyId);
  if (error) throw new Error(error.message);

  const { error: auditError } = await logAudit(supabase, {
    entityType: "tenancy",
    entityId: parsed.tenancyId,
    actorId: personId,
    action: OFFBOARDING_STARTED,
    before: { termEnd: tenancy.term_end },
    after: { endDate: parsed.endDate },
  });
  if (auditError) throw new Error(auditError.message);
  return { ok: true };
}
