"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { SKIPPABLE_STEPS } from "@/lib/offboarding/progress";
import { OFFBOARDING_STEP } from "@/server/offboarding/load-offboarding";

const RecordOffboardingStepSchema = z.discriminatedUnion("resolution", [
  // A skip always says why — it is the only record that the step was
  // consciously left out (B-43 "resolved or explicitly skipped").
  z.object({
    tenancyId: z.string().uuid(),
    step: z.enum(SKIPPABLE_STEPS as unknown as [string, ...string[]]),
    resolution: z.literal("skipped"),
    note: z.string().trim().min(1),
  }),
  z.object({
    tenancyId: z.string().uuid(),
    step: z.enum(SKIPPABLE_STEPS as unknown as [string, ...string[]]),
    resolution: z.literal("reopened"),
    note: z.null().optional(),
  }),
  // Handover protocol, manual-note version (B-13 builds the real snapshot).
  z.object({
    tenancyId: z.string().uuid(),
    step: z.literal("handover"),
    resolution: z.literal("done"),
    note: z.string().trim().min(1),
  }),
]);

// B-43: the wizard's own records are audit_log rows on the tenancy (D-44),
// append-only like every other audit entry; the latest per step wins.
export async function recordOffboardingStep(input: z.infer<typeof RecordOffboardingStepSchema>) {
  const parsed = RecordOffboardingStepSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  // Visibility check: an id the caller can't see is not theirs to annotate.
  const { data: tenancy, error } = await supabase.from("tenancies").select("id").eq("id", parsed.tenancyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!tenancy) throw new Error("Tenancy not found");

  const { error: auditError } = await logAudit(supabase, {
    entityType: "tenancy",
    entityId: parsed.tenancyId,
    actorId: personId,
    action: OFFBOARDING_STEP,
    after: { step: parsed.step, resolution: parsed.resolution, note: parsed.note ?? null },
  });
  if (auditError) throw new Error(auditError.message);
}
