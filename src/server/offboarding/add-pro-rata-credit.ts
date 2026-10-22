"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { fail, type ActionResult } from "@/lib/action-result";
import { loadOffboarding, OFFBOARDING_STEP } from "@/server/offboarding/load-offboarding";

const AddProRataCreditSchema = z.object({ tenancyId: z.string().uuid() });

// B-43 / D-44: the end month's statement carries full rent (billed in
// advance, the engine never prorates); this adds the credit for the unused
// days as a negative adjustment on the rent charge type. The amount is
// recomputed here from the stored rent and end date — never taken from the
// client — and the owner has seen it on the button before confirming.
export async function addProRataCredit(input: z.infer<typeof AddProRataCreditSchema>): Promise<ActionResult<{ amount: number }>> {
  const parsed = AddProRataCreditSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const data = await loadOffboarding(supabase, parsed.tenancyId);
  if (!data) throw new Error("Tenancy not found");
  if (!data.proRata || !data.endDate || !data.endMonth) return fail("noProRataCredit");

  // Charge types belong to the unit, not the tenancy.
  const { data: tenancy, error: tenancyError } = await supabase.from("tenancies").select("unit_id").eq("id", parsed.tenancyId).single();
  if (tenancyError) throw new Error(tenancyError.message);
  const { data: rentType, error: rentError } = await supabase
    .from("charge_types")
    .select("id")
    .eq("unit_id", tenancy.unit_id)
    .eq("code", "rent")
    .limit(1)
    .maybeSingle();
  if (rentError) throw new Error(rentError.message);
  if (!rentType) return fail("noProRataCredit");

  // Stored text, not a catalog key: adjustments.reason is shown verbatim on
  // the statement, in the owner's locale at the time of writing.
  const t = await getTranslations("offboarding");
  const { data: adjustment, error } = await supabase
    .from("adjustments")
    .insert({
      tenancy_id: parsed.tenancyId,
      charge_type_id: rentType.id,
      amount: -data.proRata.amount,
      reason: t("proRataReason", { endDate: data.endDate, days: data.proRata.unusedDays, total: data.proRata.daysInMonth }),
      target_month: data.endMonth,
      created_by: personId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // If this marker were lost the wizard would offer the credit again, so
  // fail loudly (the adjustment itself is in and visible on the draft).
  const { error: auditError } = await logAudit(supabase, {
    entityType: "tenancy",
    entityId: parsed.tenancyId,
    actorId: personId,
    action: OFFBOARDING_STEP,
    after: { step: "statement", resolution: "prorata", adjustmentId: adjustment.id, amount: -data.proRata.amount },
  });
  if (auditError) throw new Error(auditError.message);
  return { ok: true, amount: data.proRata.amount };
}
