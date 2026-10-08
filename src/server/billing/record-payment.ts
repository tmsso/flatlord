"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";

const RecordPaymentSchema = z.object({
  statementId: z.string().uuid(),
  amount: z.number().int().positive(),
  paidAt: z.string(),
  method: z.enum(["bank_transfer", "cash", "revolut", "other"]),
  note: z.string().optional(),
});

export async function recordPayment(input: {
  statementId: string;
  amount: number;
  paidAt: string;
  method: "bank_transfer" | "cash" | "revolut" | "other";
  note?: string;
}) {
  const parsed = RecordPaymentSchema.parse(input);
  const supabase = await createClient();

  // Owner-only. RLS (owner_insert_payments) is the real enforcement; this
  // fails fast and resolves payments.recorded_by (a persons.id, not an
  // auth user id).
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: statement, error: statementError } = await supabase
    .from("statements")
    .select("id, status")
    .eq("id", parsed.statementId)
    .single();
  if (statementError) throw new Error(statementError.message);
  // A payment against a still-draft statement would insert fine (the
  // status-recompute trigger no-ops on draft, by design), but
  // issue-statement's later UPDATE on `statements` doesn't itself fire
  // the *payments*-table trigger — the statement would get stuck at
  // 'issued' despite already being fully paid, until some unrelated later
  // payment event happens to re-trigger recompute. Reject up front.
  if (statement.status === "draft") {
    throw new Error("Cannot record a payment against a draft statement");
  }

  const { error } = await supabase.from("payments").insert({
    statement_id: parsed.statementId,
    amount: parsed.amount,
    paid_at: parsed.paidAt,
    method: parsed.method,
    note: parsed.note ?? null,
    recorded_by: personId,
  });
  if (error) throw new Error(error.message);
}
