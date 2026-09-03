"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { logAudit } from "@/server/audit/log";
import { notifyFieldEdit } from "@/server/notifications/notify-field-edit";
import { notifyRequestEvent } from "@/server/notifications/notify-request-event";
import { getFieldPolicyMap, resolveFieldPolicy } from "@/server/field-editability/get-field-policy-map";
import { isPersonEditableField, PERSON_EDITABLE_FIELDS } from "@/lib/field-editability/person-fields";
import { isLocale, defaultLocale } from "@/i18n/config";
import { loadMessages } from "@/lib/notifications/load-messages";
import { createTranslator } from "next-intl";

const SubmitFieldEditSchema = z.object({
  fieldName: z.string().refine(isPersonEditableField, "Unknown field"),
  value: z.string().trim().nullable(),
  // Only meaningful for the approval_required path (CLAUDE.md §3.5:
  // "old → new, note, optional attachment") — ignored otherwise.
  note: z.string().trim().min(1).nullable().optional(),
});

// Self-service only: a tenant editing their OWN person record. Co-occupants
// and admin-driven edits go through the existing admin persons CRUD UI,
// which is unrestricted by field_policies entirely (CLAUDE.md §3.5 is a
// tenant-visibility concept — the owner can always edit anything).
export async function submitFieldEdit(input: z.infer<typeof SubmitFieldEditSchema>) {
  const parsed = SubmitFieldEditSchema.parse(input);
  const supabase = await createClient();
  const profile = await getCurrentProfile(supabase);
  if (profile.role !== "tenant") throw new Error("Only a tenant can self-edit their own record this way");

  const policyMap = await getFieldPolicyMap(supabase, "person");
  const policy = resolveFieldPolicy(policyMap, parsed.fieldName);
  if (policy === "read_only") throw new Error("This field is not editable");

  // Column list is built from a validated field key, not user input
  // (isPersonEditableField already ran via the zod refine above) — the
  // `.returns<>()` override is needed because supabase-js can't statically
  // parse a computed select string into a literal column type.
  const { data: self, error: selfError } = await supabase
    .from("persons")
    .select(`given_name, family_name, ${parsed.fieldName}`)
    .eq("id", profile.personId)
    .single()
    .returns<Record<string, string | null>>();
  if (selfError) throw new Error(selfError.message);
  const oldValue = self[parsed.fieldName] ?? null;
  const personName = `${self.given_name} ${self.family_name}`;

  // tenancies.property_id is already denormalized to the root property
  // (trg_tenancies_validate_unit) — no need to walk the properties tree.
  const { data: tenancy } = await supabase
    .from("tenancies")
    .select("id, property_id")
    .eq("primary_tenant_id", profile.personId)
    .eq("status", "active")
    .maybeSingle();
  const propertyId = tenancy?.property_id ?? null;

  // CLAUDE.md §4: no hardcoded copy — the request title/notification body
  // need the field's translated label, not its raw DB column name. Uses
  // the *tenant's own* locale (this is their own act), same convention as
  // every other notify-*.ts picking the recipient's locale for their half.
  const { data: profileRow } = await supabase.from("profiles").select("locale").eq("id", profile.userId).maybeSingle();
  const locale = isLocale(profileRow?.locale) ? profileRow!.locale : defaultLocale;
  // messages typed `any` deliberately — see load-messages.ts /
  // amount-due-message.ts's comment on next-intl's t() losing its
  // interpolation-arg typing once messages is AbstractIntlMessages
  // instead of a literal-inferred JSON import.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const messages: any = await loadMessages(locale);
  const t = createTranslator({ locale, messages, namespace: "persons" });
  const fieldDef = PERSON_EDITABLE_FIELDS.find((f) => f.key === parsed.fieldName);
  const fieldLabel = fieldDef ? t(fieldDef.labelKey) : parsed.fieldName;

  if (policy === "free") {
    const { error } = await supabase
      .from("persons")
      .update({ [parsed.fieldName]: parsed.value })
      .eq("id", profile.personId);
    if (error) throw new Error(error.message);

    await logAudit(supabase, {
      entityType: "person",
      entityId: profile.personId,
      actorId: profile.personId,
      action: "field_edit",
      before: { [parsed.fieldName]: oldValue },
      after: { [parsed.fieldName]: parsed.value },
    });

    await notifyFieldEdit({ propertyId, fieldLabel, personName });
    return { applied: true as const };
  }

  // approval_required: one pending request per field at a time — a second
  // edit attempt while one is already open would otherwise silently
  // create a competing request for the same field.
  const { data: pending } = await supabase
    .from("requests")
    .select("id")
    .eq("initiated_by", profile.personId)
    .eq("status", "open")
    .eq("category", "personal_data_change")
    .contains("change_payload", { entityType: "person", entityId: profile.personId, fieldName: parsed.fieldName })
    .maybeSingle();
  if (pending) throw new Error("A change request for this field is already pending");

  if (!tenancy) throw new Error("No active tenancy found");

  const { data: request, error: insertError } = await supabase
    .from("requests")
    .insert({
      tenancy_id: tenancy.id,
      category: "personal_data_change",
      title: t("changeRequestTitle", { field: fieldLabel }),
      description: parsed.note ?? null,
      change_payload: {
        entityType: "person",
        entityId: profile.personId,
        fieldName: parsed.fieldName,
        oldValue,
        newValue: parsed.value,
      },
      initiated_by: profile.personId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  // Deliberately not logging change_payload here — it can carry a
  // sensitive field's raw value, and audit_log's redaction only strips
  // top-level keys named like the sensitive column (documentNumber etc.),
  // not a nested `newValue` inside this jsonb shape. The request row
  // itself is the durable, reviewable record of the proposed change;
  // audit_log's job here is just "a request was created".
  await logAudit(supabase, {
    entityType: "request",
    entityId: request.id,
    actorId: profile.personId,
    action: "create",
    after: { category: "personal_data_change", fieldName: parsed.fieldName },
  });

  await notifyRequestEvent({ requestId: request.id, event: "opened", actorRole: "tenant" });
  return { applied: false as const, requestId: request.id as string };
}
