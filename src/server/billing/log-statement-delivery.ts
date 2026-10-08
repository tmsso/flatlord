import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DeliveryChannel = "email" | "whatsapp";
export type DeliveryKind = "amount_due" | "payment_reminder";
export type DeliveryStatus = "sent" | "failed" | "prepared";

// Appends one row to statement_deliveries (migration 0028). Never throws:
// the log is a record *about* a send, so a logging failure (including the
// table not existing yet, if code deploys before the prod migration) must
// never turn a successful email into an error for the admin.
export async function logStatementDelivery(
  supabase: SupabaseClient,
  entry: {
    statementId: string;
    channel: DeliveryChannel;
    kind: DeliveryKind;
    status: DeliveryStatus;
    providerMessageId?: string | null;
    error?: string | null;
    createdBy?: string | null;
  },
): Promise<void> {
  try {
    const { error } = await supabase.from("statement_deliveries").insert({
      statement_id: entry.statementId,
      channel: entry.channel,
      kind: entry.kind,
      status: entry.status,
      provider_message_id: entry.providerMessageId ?? null,
      error: entry.error ?? null,
      created_by: entry.createdBy ?? null,
    });
    if (error) console.error("[logStatementDelivery] insert failed:", error.message);
  } catch (err) {
    console.error("[logStatementDelivery] unexpected failure:", err instanceof Error ? err.message : err);
  }
}
