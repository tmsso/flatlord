"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const IssueStatementSchema = z.object({
  statementId: z.string().uuid(),
});

// No statements column needs the caller's identity, so — like
// create-draft-statement.ts — this relies entirely on RLS
// (owner_update_statements) for authorization.
//
// Known gap, deliberately deferred: no mechanism in this milestone to
// edit/regenerate a draft before issuing (same missing M7 admin
// capability create-draft-statement.ts's own gap points at). totalHuf
// is left untouched here since it's already correct from draft creation.
export async function issueStatement(input: { statementId: string }) {
  const parsed = IssueStatementSchema.parse(input);
  const supabase = await createClient();

  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("id, tenancy_id, period_month, status")
    .eq("id", parsed.statementId)
    .single();
  if (statementError) throw new Error(statementError.message);
  if (statement.status !== "draft") throw new Error("Only a draft statement can be issued");

  const { data: tenancy, error: tenancyError } = await supabase
    .from("tenancies")
    .select("due_day, reminder_lead_days, primary_tenant_id")
    .eq("id", statement.tenancy_id)
    .single();
  if (tenancyError) throw new Error(tenancyError.message);

  // periodMonth is always "YYYY-MM-01" and due_day is capped 1-28 (CHECK
  // due_day_range), so this is always a valid calendar date — no
  // month-length edge cases to handle.
  const dueDate = `${statement.period_month.slice(0, 7)}-${String(tenancy.due_day).padStart(2, "0")}`;

  // Kept intentionally small for M4 — richer snapshot content (tenant
  // contact info, etc.) is an M9 email-delivery concern, not this
  // milestone's job.
  const issuedSnapshot = {
    dueDay: tenancy.due_day,
    reminderLeadDays: tenancy.reminder_lead_days,
    tenancyId: statement.tenancy_id,
    primaryTenantId: tenancy.primary_tenant_id,
  };

  const { error: updateError } = await supabase
    .from("statements")
    .update({
      status: "issued",
      due_date: dueDate,
      issued_at: new Date().toISOString(),
      issued_snapshot: issuedSnapshot,
    })
    .eq("id", parsed.statementId);
  if (updateError) throw new Error(updateError.message);

  return { statementId: parsed.statementId, dueDate };
}
