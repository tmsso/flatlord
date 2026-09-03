// Canonical set of `persons` columns the field-level editability feature
// (ROADMAP Phase 3 item 3, CLAUDE.md §3.5) recognizes for entityType =
// 'person'. Deliberately a fixed allow-list, not "every column" — this is
// what stands between a tenant's own submit-field-edit.ts call and an
// arbitrary column write, since RLS here only scopes rows, not columns
// (see migration 0021's self_update_persons policy comment).
//
// `key` is the snake_case DB column name (not the drizzle camelCase field)
// because every runtime query in this codebase goes through supabase-js
// directly, not drizzle — drizzle is migration-time only. `labelKey`
// reuses the existing "persons" i18n namespace (already has a *Label key
// per field from the Phase 1 admin CRUD UI) rather than duplicating labels
// in a new namespace.
export interface PersonFieldDef {
  key: string;
  labelKey: string;
  inputType: "text" | "date" | "email";
}

export const PERSON_EDITABLE_FIELDS: readonly PersonFieldDef[] = [
  { key: "given_name", labelKey: "givenNameLabel", inputType: "text" },
  { key: "family_name", labelKey: "familyNameLabel", inputType: "text" },
  { key: "birth_name", labelKey: "birthNameLabel", inputType: "text" },
  { key: "mothers_name", labelKey: "mothersNameLabel", inputType: "text" },
  { key: "birth_place", labelKey: "birthPlaceLabel", inputType: "text" },
  { key: "dob", labelKey: "dobLabel", inputType: "date" },
  { key: "citizenship", labelKey: "citizenshipLabel", inputType: "text" },
  { key: "document_number", labelKey: "documentNumberLabel", inputType: "text" },
  { key: "address_card_number", labelKey: "addressCardNumberLabel", inputType: "text" },
  { key: "tax_id", labelKey: "taxIdLabel", inputType: "text" },
  { key: "phone", labelKey: "phoneLabel", inputType: "text" },
  { key: "contact_email", labelKey: "contactEmailLabel", inputType: "email" },
  { key: "registered_address", labelKey: "registeredAddressLabel", inputType: "text" },
  { key: "temporary_address", labelKey: "temporaryAddressLabel", inputType: "text" },
];

export const PERSON_EDITABLE_FIELD_KEYS = PERSON_EDITABLE_FIELDS.map((f) => f.key);

export function isPersonEditableField(key: string): boolean {
  return PERSON_EDITABLE_FIELD_KEYS.includes(key);
}

// Same set src/server/audit/log.ts redacts before writing audit_log —
// duplicated here (rather than importing NEVER_LOG_KEYS, which is keyed
// by both camelCase and snake_case for its own different callers) so the
// UI can decide when to route a field through the masked <PersonFieldValue>
// display component regardless of audit-log wiring.
export const PERSON_SENSITIVE_FIELD_KEYS = new Set(["document_number"]);
