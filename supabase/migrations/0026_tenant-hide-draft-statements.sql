-- B-26: a tenant must never see a draft statement (or its line items)
-- before the admin issues it. The tenant SELECT policies previously scoped
-- by tenancy only. The page queries also filter drafts; these policies are
-- the backstop (CLAUDE.md §6: RLS is the last line of defence, not the
-- only one). Owner policies are unchanged.
DROP POLICY IF EXISTS tenant_scope_statements ON statements;--> statement-breakpoint
CREATE POLICY tenant_scope_statements ON statements
  FOR SELECT USING (
    statements.status <> 'draft'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = statements.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );--> statement-breakpoint

-- Line items carry their own tenancy_id, so the policy above doesn't
-- cover them; check the parent statement's status directly.
DROP POLICY IF EXISTS tenant_scope_statement_line_items ON statement_line_items;--> statement-breakpoint
CREATE POLICY tenant_scope_statement_line_items ON statement_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      JOIN statements s ON s.id = statement_line_items.statement_id
      WHERE t.id = statement_line_items.tenancy_id
        AND s.status <> 'draft'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
