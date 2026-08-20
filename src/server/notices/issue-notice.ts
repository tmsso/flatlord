"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { storeAttachment } from "@/lib/attachments/store-attachment";
import { notifyNoticeIssued } from "@/server/notifications/notify-notice-issued";
import { NOTICE_TYPES, NOTICE_SEQUENCES } from "@/db/schema/notices";

// sequence only ever applies to formal_warning (CLAUDE.md §3.8); the
// pairing is enforced here, not at the DB level (notices_sequence_check
// only rejects an out-of-vocabulary value, not a type/sequence mismatch —
// see notices.ts's comment). requiresAcknowledgement is accepted from the
// client for non-formal_warning types (an admin choice at creation, per
// the task spec) but forced true server-side for formal_warning
// regardless of what was submitted, one line below.
const IssueNoticeSchema = z
  .object({
    tenancyId: z.string().uuid(),
    type: z.enum(NOTICE_TYPES),
    title: z.string().trim().min(1),
    body: z.string().trim().min(1),
    contractClauseRef: z.string().trim().min(1).nullable().optional(),
    sequence: z.enum(NOTICE_SEQUENCES).nullable().optional(),
    requiresAcknowledgement: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.sequence && val.type !== "formal_warning") {
      ctx.addIssue({ code: "custom", path: ["sequence"], message: "sequence_requires_formal_warning" });
    }
  });

// Owner-only, insert-only (CLAUDE.md §3.8: "Immutable once issued") — this
// is the only write path into `notices` besides acknowledge-notice.ts's
// narrowly-scoped tenant update. There is deliberately no update-notice.ts
// / delete-notice.ts.
export async function issueNotice(input: z.infer<typeof IssueNoticeSchema>, file?: File) {
  const parsed = IssueNoticeSchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const requiresAcknowledgement = parsed.type === "formal_warning" ? true : (parsed.requiresAcknowledgement ?? false);

  const { data: notice, error: insertError } = await supabase
    .from("notices")
    .insert({
      tenancy_id: parsed.tenancyId,
      type: parsed.type,
      title: parsed.title,
      body: parsed.body,
      contract_clause_ref: parsed.contractClauseRef ?? null,
      sequence: parsed.type === "formal_warning" ? (parsed.sequence ?? null) : null,
      requires_acknowledgement: requiresAcknowledgement,
      issued_by: personId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  if (file) {
    await storeAttachment(supabase, { entityType: "notice", entityId: notice.id, uploadedBy: personId }, file);
  }

  await logAudit(supabase, {
    entityType: "notice",
    entityId: notice.id,
    actorId: personId,
    action: "create",
    after: { type: parsed.type, title: parsed.title, requiresAcknowledgement },
  });

  await notifyNoticeIssued({ noticeId: notice.id });

  return { id: notice.id as string };
}
