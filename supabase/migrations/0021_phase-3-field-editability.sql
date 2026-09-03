-- Phase 3 field-level editability (CLAUDE.md §3.5). field_policies has
-- existed since Phase 0 (migration 0000) but was only ever readable by
-- owners (migration 0001) and had no write access at all — this is the
-- migration that actually wires it up.
--
-- No schema change to field_policies itself: no DB uniqueness constraint
-- is added for (entity_type, field_name, scope) because a plain unique
-- constraint doesn't stop duplicate NULL-scope rows anyway (Postgres
-- treats NULL as distinct), and every write in v1 goes through
-- set-field-policy.ts's select-then-insert-or-update, which already
-- guarantees no duplicates for the only case actually used (global,
-- scope = NULL) — same "app-enforced, not a DB CHECK" reasoning as
-- field_requirements.ts.
CREATE POLICY authenticated_read_field_policies ON field_policies
  FOR SELECT USING (true);
--> statement-breakpoint

CREATE POLICY owner_insert_field_policies ON field_policies
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

CREATE POLICY owner_update_field_policies ON field_policies
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

CREATE POLICY owner_delete_field_policies ON field_policies
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

GRANT INSERT, UPDATE, DELETE ON field_policies TO authenticated;
--> statement-breakpoint

-- Self-service UPDATE on persons: a tenant editing a `free`-policy field
-- of their own record goes through their own RLS-scoped client, same
-- trust model as everywhere else in this codebase (Zod/allow-list checks
-- in the server action are the real gate; RLS here only scopes *rows*,
-- not *columns* — Postgres column-level GRANTs can't vary by RLS policy
-- since owner and tenant share the `authenticated` role, so this policy
-- deliberately does not attempt column-level enforcement; see
-- submit-field-edit.ts for the column allow-list that does).
CREATE POLICY self_update_persons ON persons
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.person_id = persons.id)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.person_id = persons.id)
  );
--> statement-breakpoint

-- Default policy seed (admin can change any of these via the new settings
-- UI): contact-only fields default to free; identity/legal fields default
-- to approval_required (CLAUDE.md §3.2 — spelling corrections against
-- passports are a real recurring case, and this is the pending-change-
-- request path that reviews them). document_type (an enum, not free text)
-- is deliberately not in this set yet — PERSON_EDITABLE_FIELDS doesn't
-- offer it a plain-text editor; a future batch can add proper enum-select
-- support and a policy row for it then. Everything else on `persons` stays
-- read_only by the table's own default (no row needed).
INSERT INTO field_policies (entity_type, field_name, policy, scope) VALUES
  ('person', 'phone', 'free', NULL),
  ('person', 'contact_email', 'free', NULL),
  ('person', 'temporary_address', 'free', NULL),
  ('person', 'given_name', 'approval_required', NULL),
  ('person', 'family_name', 'approval_required', NULL),
  ('person', 'document_number', 'approval_required', NULL),
  ('person', 'dob', 'approval_required', NULL),
  ('person', 'birth_name', 'approval_required', NULL),
  ('person', 'birth_place', 'approval_required', NULL),
  ('person', 'mothers_name', 'approval_required', NULL),
  ('person', 'citizenship', 'approval_required', NULL),
  ('person', 'address_card_number', 'approval_required', NULL),
  ('person', 'tax_id', 'approval_required', NULL),
  ('person', 'registered_address', 'approval_required', NULL);
