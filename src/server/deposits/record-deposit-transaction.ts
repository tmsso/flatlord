"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";

const RecordDepositTransactionSchema = z.object({
  tenancyId: z.string().uuid(),
  type: z.enum(["paid", "applied", "retained", "refunded"]),
  // Always a non-negative magnitude — the sign each type contributes to
  // the running balance lives in compute-deposit-balance.ts, not here.
  amount: z.number().int().nonnegative(),
  currency: z.string().length(3).default("HUF"),
  transactionDate: z.string().min(1, "transactionDateRequired"),
  note: z.string().optional(),
  appliedToStatementId: z.string().uuid().nullable().optional(),
});

export async function recordDepositTransaction(input: z.infer<typeof RecordDepositTransactionSchema>) {
  const parsed = RecordDepositTransactionSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data, error } = await supabase
    .from("deposit_transactions")
    .insert({
      tenancy_id: parsed.tenancyId,
      type: parsed.type,
      amount: parsed.amount,
      currency: parsed.currency,
      transaction_date: parsed.transactionDate,
      note: parsed.note ?? null,
      applied_to_statement_id: parsed.appliedToStatementId ?? null,
      recorded_by: personId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logAudit(supabase, {
    entityType: "deposit_transaction",
    entityId: data.id,
    actorId: personId,
    action: "create",
    after: { tenancyId: parsed.tenancyId, type: parsed.type, amount: parsed.amount },
  });

  return { id: data.id as string };
}
