"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { fail, type ActionResult } from "@/lib/action-result";
import { loadOffboarding } from "@/server/offboarding/load-offboarding";

const EndTenancySchema = z.object({ tenancyId: z.string().uuid() });

// B-43, last checklist step: only once every other step is done or
// explicitly skipped (re-checked here, not trusted from the client). Sets
// the tenancy to "ended" and revokes the tenant's unused invites; the proxy
// then signs the tenant out on their next request (no live tenancy left).
// Nothing is deleted — the account, history and documents stay.
export async function endTenancy(input: z.infer<typeof EndTenancySchema>): Promise<ActionResult> {
  const parsed = EndTenancySchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const data = await loadOffboarding(supabase, parsed.tenancyId);
  if (!data) throw new Error("Tenancy not found");
  if (!data.progress.readyToEnd || !data.endDate) return fail("offboardingIncomplete");
  if (data.tenancy.status !== "active") return fail("tenancyNotActive");

  const { data: tenancy, error } = await supabase
    .from("tenancies")
    .update({ status: "ended", term_end: data.endDate })
    .eq("id", parsed.tenancyId)
    .select("primary_tenant_id")
    .single();
  if (error) throw new Error(error.message);

  const { error: inviteError } = await supabase
    .from("invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("person_id", tenancy.primary_tenant_id)
    .eq("role", "tenant")
    .is("consumed_at", null)
    .is("revoked_at", null);
  if (inviteError) throw new Error(inviteError.message);

  await logAudit(supabase, {
    entityType: "tenancy",
    entityId: parsed.tenancyId,
    actorId: personId,
    action: "update",
    before: { status: "active" },
    after: { status: "ended", termEnd: data.endDate, via: "offboarding" },
  });
  return { ok: true };
}
