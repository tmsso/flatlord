"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const ActivateContractSchema = z.object({
  contractId: z.string().uuid(),
});

// Admin's explicit "activate" action — the only place a contract's
// structured key terms are copied onto the tenancy row (ROADMAP Phase 2:
// "structured key terms driving tenancy record"). Nothing about upload or
// parsing (this item's own extraction, or the next item's OCR-assisted
// proposal) ever writes to tenancies directly — see create-contract.ts and
// (Phase 2 item 2) review-parsed-contract.ts.
//
// Known gap, same shape as create-draft-statement.ts: the three writes
// below (supersede predecessor, activate this version, update tenancy)
// are sequential supabase-js calls, not one transaction. A failure between
// them leaves inconsistent state; contracts_one_active_per_tenancy
// (migration 0015) at least guarantees it can never be *two* active
// versions, only possibly zero.
export async function activateContract(input: z.infer<typeof ActivateContractSchema>) {
  const parsed = ActivateContractSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .select("id, tenancy_id, status, term_start, term_end, notice_days")
    .eq("id", parsed.contractId)
    .single();
  if (contractError) throw new Error(contractError.message);
  if (contract.status !== "draft") throw new Error("onlyDraftCanActivate");

  const { data: currentActive } = await supabase
    .from("contracts")
    .select("id")
    .eq("tenancy_id", contract.tenancy_id)
    .eq("status", "active")
    .maybeSingle();

  if (currentActive) {
    const { error: supersedeError } = await supabase
      .from("contracts")
      .update({ status: "superseded" })
      .eq("id", currentActive.id);
    if (supersedeError) throw new Error(supersedeError.message);
  }

  const { error: activateError } = await supabase
    .from("contracts")
    .update({ status: "active" })
    .eq("id", contract.id);
  if (activateError) throw new Error(activateError.message);

  const tenancyUpdate: Record<string, unknown> = {};
  if (contract.term_start) tenancyUpdate.term_start = contract.term_start;
  if (contract.term_end !== undefined) tenancyUpdate.term_end = contract.term_end;
  if (contract.notice_days != null) tenancyUpdate.notice_days = contract.notice_days;

  if (Object.keys(tenancyUpdate).length > 0) {
    const { error: tenancyError } = await supabase
      .from("tenancies")
      .update(tenancyUpdate)
      .eq("id", contract.tenancy_id);
    if (tenancyError) throw new Error(tenancyError.message);
  }

  await logAudit(supabase, {
    entityType: "contract",
    entityId: contract.id,
    actorId: personId,
    action: "activate",
    before: { previousActiveContractId: currentActive?.id ?? null },
    after: { status: "active", tenancyId: contract.tenancy_id },
  });

  return { id: contract.id as string };
}
