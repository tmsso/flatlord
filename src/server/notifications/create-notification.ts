import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export interface CreateNotificationParams {
  recipientProfileId: string;
  category: string;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}

// The in-app half of every notify-*.ts call (CLAUDE.md §3.11's
// notification centre) — always written regardless of the recipient's
// email preference; only the email *send* is gated by
// shouldEmailNotification. Best-effort, never throws — same principle as
// logAudit/the email sends themselves: a broken write here must not roll
// back the mutation that already happened.
export async function createNotification(params: CreateNotificationParams) {
  try {
    const service = createServiceRoleClient();
    const { error } = await service.from("notifications").insert({
      recipient_profile_id: params.recipientProfileId,
      category: params.category,
      title: params.title,
      body: params.body ?? null,
      entity_type: params.entityType ?? null,
      entity_id: params.entityId ?? null,
    });
    if (error) console.error("createNotification: insert failed", error.message);
  } catch (err) {
    console.error("createNotification: unexpected failure", err instanceof Error ? err.message : err);
  }
}
