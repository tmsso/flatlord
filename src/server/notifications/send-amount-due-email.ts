"use server";

import { z } from "zod";
import { createResendClient } from "@/lib/email/resend-client";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { resolveAmountDueContext } from "@/server/notifications/resolve-amount-due-context";
import { logStatementDelivery } from "@/server/billing/log-statement-delivery";
import { fail, type ActionResult } from "@/lib/action-result";

const SendAmountDueEmailSchema = z.object({
  statementId: z.string().uuid(),
});

// Resend sandbox sender (default RESEND_FROM_EMAIL / no domain verified
// yet) only delivers to the Resend account owner's own address — a real
// sending domain is a separate, later decision (ROADMAP.md Phase 1
// status). The wa.me button in send-amount-due-buttons.tsx has no such
// restriction and works today regardless.
export async function sendAmountDueEmail(input: { statementId: string }): Promise<ActionResult> {
  const parsed = SendAmountDueEmailSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const context = await resolveAmountDueContext(supabase, parsed.statementId);
  if (!context) return fail("nothingOutstanding");
  const { subject, body, tenantEmail } = context;
  if (!tenantEmail) return fail("tenantHasNoEmail");

  const resend = createResendClient();
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
    to: tenantEmail,
    subject,
    text: body,
  });
  // Logged either way (design/05 delivery log); a failed send is still
  // worth seeing next to the statement.
  await logStatementDelivery(supabase, {
    statementId: parsed.statementId,
    channel: "email",
    kind: "amount_due",
    status: error ? "failed" : "sent",
    providerMessageId: data?.id ?? null,
    error: error?.message ?? null,
    createdBy: personId,
  });
  if (error) throw new Error(error.message);

  return { ok: true };
}
