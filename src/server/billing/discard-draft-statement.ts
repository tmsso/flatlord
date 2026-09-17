"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const DiscardDraftStatementSchema = z.object({
  statementId: z.string().uuid(),
});

// BACKLOG.md B-05: a draft created from incomplete inputs (an orphaned
// insert between the statement row and its line items — see
// create-draft-statement-core.ts's own documented gap, or simply a
// draft the admin wants to throw away and recompute) permanently wedges
// its (tenancy_id, period_month) slot, since that pair is unique. This
// frees it.
//
// Soft only (CLAUDE.md §3.5 "never hard-delete; status flags") — same
// idiom as adjustments.voidedAt, not a new statement-status enum value
// (Postgres enums can't gain a value and use it in the same migration
// transaction; see the flatlord_postgres_enum_extend_same_tx gotcha).
// The (tenancy_id, period_month) unique constraint is now a *partial*
// unique index (`WHERE voided_at IS NULL`, migration 0025) so a voided
// row no longer blocks a fresh draft for the same period — the old row
// and its line items simply stay in place as a record of what was
// computed.
//
// Issued statements are immutable (CLAUDE.md §3.3) and stay that way:
// this refuses anything that isn't still a draft, on top of RLS.
export async function discardDraftStatement(input: { statementId: string }) {
  const parsed = DiscardDraftStatementSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("id, tenancy_id, period_month, status, voided_at")
    .eq("id", parsed.statementId)
    .single();
  if (statementError) throw new Error(statementError.message);
  if (statement.status !== "draft") throw new Error("Only a draft statement can be discarded");
  if (statement.voided_at) throw new Error("This draft was already discarded");

  const voidedAt = new Date().toISOString();
  const { error: updateError } = await supabase.from("statements").update({ voided_at: voidedAt }).eq("id", parsed.statementId);
  if (updateError) throw new Error(updateError.message);

  await logAudit(supabase, {
    entityType: "statement",
    entityId: parsed.statementId,
    actorId: personId,
    action: "discard_draft",
    before: { voidedAt: null, periodMonth: statement.period_month, tenancyId: statement.tenancy_id },
    after: { voidedAt },
  });

  return { statementId: parsed.statementId };
}
