-- Bug fix found via real click-through verification (headless Playwright
-- against dev), not by any unit/RLS test: audit_log has only ever had an
-- owner-only INSERT policy (owner_insert_audit_log, migration 0012).
-- Every tenant-initiated logAudit() call — create-request.ts,
-- withdraw-request.ts, add-request-message.ts, and now
-- submit-field-edit.ts's free/approval_required paths — has been silently
-- failing since the requests module shipped (migration 0019): logAudit()
-- never throws on error by design (same as its own comment states), so
-- the mutation itself always succeeded while the audit_log row silently
-- never got written. CLAUDE.md §3.5's "Full audit history on all edited
-- entities (who, when, before/after)" has therefore never actually held
-- for the tenant-actor half of any of these flows in production.
--
-- Scoped narrowly: a tenant may only insert a row recording themselves as
-- the actor (actor_id = their own person_id) — never on another person's
-- behalf, matching every real call site (actorId is always the caller's
-- own profile.personId).
CREATE POLICY tenant_insert_audit_log ON audit_log
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'tenant' AND pr.person_id = audit_log.actor_id
    )
  );
