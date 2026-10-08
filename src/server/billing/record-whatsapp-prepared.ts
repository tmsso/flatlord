"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logStatementDelivery } from "@/server/billing/log-statement-delivery";

const Schema = z.object({ statementId: z.string().uuid() });

// Called when the admin opens the statement's wa.me link. WhatsApp sends
// happen on the admin's own device, so the app can only record that the
// message was prepared — never that it was sent (design/05 delivery log).
export async function recordWhatsappPrepared(input: { statementId: string }) {
  const { statementId } = Schema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);
  await logStatementDelivery(supabase, {
    statementId,
    channel: "whatsapp",
    kind: "amount_due",
    status: "prepared",
    createdBy: personId,
  });
}
