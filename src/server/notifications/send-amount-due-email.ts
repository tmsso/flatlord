"use server";

import { z } from "zod";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { resolveAmountDueContext } from "@/server/notifications/resolve-amount-due-context";

const SendAmountDueEmailSchema = z.object({
  statementId: z.string().uuid(),
});

// Resend sandbox sender (default RESEND_FROM_EMAIL / no domain verified
// yet) only delivers to the Resend account owner's own address — a real
// sending domain is a separate, later decision (ROADMAP.md Phase 1
// status). The wa.me button in send-amount-due-buttons.tsx has no such
// restriction and works today regardless.
export async function sendAmountDueEmail(input: { statementId: string }) {
  const parsed = SendAmountDueEmailSchema.parse(input);
  const supabase = await createClient();
  await requireOwnerPersonId(supabase);

  const { subject, body, tenantEmail } = await resolveAmountDueContext(supabase, parsed.statementId);
  if (!tenantEmail) throw new Error("Tenant has no contact email on file");

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "Flatlord <onboarding@resend.dev>",
    to: tenantEmail,
    subject,
    text: body,
  });
  if (error) throw new Error(error.message);

  return { ok: true };
}
