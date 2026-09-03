"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOwnerPersonId } from "@/server/auth/require-owner";
import { logAudit } from "@/server/audit/log";
import { isPersonEditableField } from "@/lib/field-editability/person-fields";
import { FIELD_POLICIES } from "@/db/schema/field-policies-values";

const SetFieldPolicySchema = z.object({
  // Only 'person' is wired up in v1 (ROADMAP Phase 3 item 3) — the schema
  // itself is generic (entity_type is free text), this literal is just
  // this action's own current scope.
  entityType: z.literal("person"),
  fieldName: z.string().refine(isPersonEditableField, "Unknown field"),
  policy: z.enum(FIELD_POLICIES),
});

// select-then-insert-or-update, not a DB upsert on a unique constraint —
// see migration 0021's comment on why field_policies has no such
// constraint to upsert against.
export async function setFieldPolicy(input: z.infer<typeof SetFieldPolicySchema>) {
  const parsed = SetFieldPolicySchema.parse(input);
  const supabase = await createClient();
  const { personId } = await requireOwnerPersonId(supabase);

  const { data: existing, error: selectError } = await supabase
    .from("field_policies")
    .select("id, policy")
    .eq("entity_type", parsed.entityType)
    .eq("field_name", parsed.fieldName)
    .is("scope", null)
    .maybeSingle();
  if (selectError) throw new Error(selectError.message);

  if (existing) {
    const { error } = await supabase.from("field_policies").update({ policy: parsed.policy }).eq("id", existing.id);
    if (error) throw new Error(error.message);
    await logAudit(supabase, {
      entityType: "field_policy",
      entityId: existing.id,
      actorId: personId,
      action: "update",
      before: { policy: existing.policy },
      after: { policy: parsed.policy },
    });
  } else {
    const { data: inserted, error } = await supabase
      .from("field_policies")
      .insert({ entity_type: parsed.entityType, field_name: parsed.fieldName, policy: parsed.policy })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAudit(supabase, {
      entityType: "field_policy",
      entityId: inserted.id,
      actorId: personId,
      action: "create",
      after: { entityType: parsed.entityType, fieldName: parsed.fieldName, policy: parsed.policy },
    });
  }
}
