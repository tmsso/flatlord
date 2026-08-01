import type { SupabaseClient } from "@supabase/supabase-js";

// Sensitive person fields CLAUDE.md §6 says must "never be logged" —
// applies regardless of entityType, since tenancy_occupants/tenancies
// snapshots can also carry a denormalized person shape in the future.
// Their presence/absence still needs to be visible in the audit trail (an
// admin reviewing history needs to know *that* a document number changed),
// just never the value.
// Both cases listed: `before` snapshots come straight from a supabase-js
// `.select()` (snake_case columns), `after` snapshots are built from
// parsed action input (camelCase) — this list has to catch either.
const NEVER_LOG_KEYS = new Set([
  "documentNumber",
  "document_number",
  "mothersName",
  "mothers_name",
  "taxId",
  "tax_id",
  "addressCardNumber",
  "address_card_number",
  "birthName",
  "birth_name",
  "birthPlace",
  "birth_place",
  "citizenship",
]);

function redact(snapshot: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!snapshot) return snapshot;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(snapshot)) {
    result[key] = NEVER_LOG_KEYS.has(key) ? (value == null ? null : "[redacted]") : value;
  }
  return result;
}

export async function logAudit(
  supabase: SupabaseClient,
  params: {
    entityType: string;
    entityId: string;
    actorId: string | null;
    action: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  },
) {
  const { error } = await supabase.from("audit_log").insert({
    entity_type: params.entityType,
    entity_id: params.entityId,
    actor_id: params.actorId,
    action: params.action,
    before: redact(params.before ?? null),
    after: redact(params.after ?? null),
  });
  // Audit logging failure shouldn't be silent, but it also shouldn't be
  // allowed to roll back a mutation that already succeeded (no
  // transactional wrapping exists yet across supabase-js calls, same
  // known gap documented in create-draft-statement.ts). Surface it loudly
  // via console.error rather than throwing.
  if (error) {
    console.error(`audit_log insert failed for ${params.entityType}:${params.entityId}`, error.message);
  }
}
