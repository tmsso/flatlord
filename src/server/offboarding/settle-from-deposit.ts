"use server";

import { z } from "zod";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { fail, type ActionResult } from "@/lib/action-result";
import { computeDepositBalance, type DepositTransactionType } from "@/lib/deposits/compute-deposit-balance";

const SettleFromDepositSchema = z.object({ tenancyId: z.string().uuid() });

// B-43 / D-45: "apply the deposit to the outstanding balance". A deposit
// "applied" transaction alone doesn't settle a statement (statement status
// follows the payments table), so for each unpaid issued statement, oldest
// first, this records both halves: the applied deposit transaction linked to
// the statement and a matching payment (method "other", noted as deposit).
// Amounts are computed here from stored rows, never from the client.
export async function settleFromDeposit(input: z.infer<typeof SettleFromDepositSchema>): Promise<ActionResult<{ settled: number }>> {
  const parsed = SettleFromDepositSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const [{ data: deposits, error: depositError }, { data: statements, error: statementError }] = await Promise.all([
    supabase.from("deposit_transactions").select("type, amount, currency").eq("tenancy_id", parsed.tenancyId),
    supabase
      .from("statements")
      .select("id, total, currency, period_month, payments(amount)")
      .eq("tenancy_id", parsed.tenancyId)
      .in("status", ["issued", "partially_paid", "overdue"])
      .is("voided_at", null)
      .order("period_month", { ascending: true }),
  ]);
  if (depositError) throw new Error(depositError.message);
  if (statementError) throw new Error(statementError.message);

  let balance = computeDepositBalance((deposits ?? []).map((d) => ({ type: d.type as DepositTransactionType, amount: Number(d.amount) })));
  if (balance <= 0) return fail("noDepositToApply");

  const t = await getTranslations("offboarding");
  const today = new Date().toISOString().slice(0, 10);
  let settled = 0;
  for (const s of statements ?? []) {
    if (balance <= 0) break;
    const paid = ((s.payments as { amount: number }[] | null) ?? []).reduce((sum, p) => sum + Number(p.amount), 0);
    const amount = Math.min(Number(s.total) - paid, balance);
    if (amount <= 0) continue;

    const { data: tx, error: txError } = await supabase
      .from("deposit_transactions")
      .insert({
        tenancy_id: parsed.tenancyId,
        type: "applied",
        amount,
        currency: s.currency,
        transaction_date: today,
        note: t("depositAppliedNote"),
        applied_to_statement_id: s.id,
        recorded_by: personId,
      })
      .select("id")
      .single();
    if (txError) throw new Error(txError.message);
    const { error: paymentError } = await supabase.from("payments").insert({
      statement_id: s.id,
      amount,
      paid_at: today,
      method: "other",
      note: t("depositAppliedNote"),
      recorded_by: personId,
    });
    if (paymentError) throw new Error(paymentError.message);

    await logAudit(supabase, {
      entityType: "deposit_transaction",
      entityId: tx.id,
      actorId: personId,
      action: "create",
      after: { tenancyId: parsed.tenancyId, type: "applied", amount, statementId: s.id, via: "offboarding" },
    });
    balance -= amount;
    settled += amount;
  }
  if (settled === 0) return fail("nothingOutstanding");
  return { ok: true, settled };
}
