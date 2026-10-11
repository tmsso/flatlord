-- B-28 (2026-10-08 abuse-path audit): three tenant write policies checked
-- scope but not the *other* columns, so a tenant calling the Supabase REST
-- API directly (not through the app's server actions) could write values
-- the app never would. Same class as 0027, lower stakes. Owner policies
-- are unchanged.
--
-- 1. tenant_insert_requests: a tenant-opened request must start 'open',
--    carry no external case reference (insurer/service refs are the
--    admin's field), be initiated by the caller themself, target an
--    active tenancy, and may only carry a change_payload for a
--    personal-data change about the caller's own person record — the
--    shape submit-field-edit.ts writes. Without that last pin a tenant
--    could forge a change request about someone else's person row, which
--    the admin might approve from the diff card.
DROP POLICY IF EXISTS tenant_insert_requests ON requests;--> statement-breakpoint
CREATE POLICY tenant_insert_requests ON requests
  FOR INSERT WITH CHECK (
    requests.status = 'open'
    AND requests.external_case_ref IS NULL
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = requests.tenancy_id AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
        AND pr.person_id = requests.initiated_by
        AND (
          requests.change_payload IS NULL
          OR (
            requests.category = 'personal_data_change'
            AND requests.change_payload->>'entityType' = 'person'
            AND requests.change_payload->>'entityId' = pr.person_id::text
          )
        )
    )
  );
--> statement-breakpoint

-- 2. tenant_withdraw_requests: withdrawing may change status (and the
--    updated_at stamp) and nothing else. "Unchanged" means comparing the
--    new row with the row as stored, which column-level GRANTs can't
--    express on dev (permanent default ACL). A plain subquery on
--    `requests` from this policy trips Postgres's "infinite recursion
--    detected in policy" guard (verified on dev), so the read lives in a
--    SECURITY DEFINER function (the 0012 pattern) — in a `private`
--    schema PostgREST doesn't expose, so a tenant can't call it over RPC
--    as an oracle for other tenants' rows.
CREATE SCHEMA IF NOT EXISTS private;--> statement-breakpoint
GRANT USAGE ON SCHEMA private TO authenticated;--> statement-breakpoint
CREATE OR REPLACE FUNCTION private.request_withdraw_keeps_fields(r requests)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM requests old
    WHERE old.id = r.id
      AND old.tenancy_id = r.tenancy_id
      AND old.property_id = r.property_id
      AND old.category = r.category
      AND old.title = r.title
      AND old.description IS NOT DISTINCT FROM r.description
      AND old.external_case_ref IS NOT DISTINCT FROM r.external_case_ref
      AND old.appointment_date IS NOT DISTINCT FROM r.appointment_date
      AND old.change_payload IS NOT DISTINCT FROM r.change_payload
      AND old.initiated_by = r.initiated_by
      AND old.created_at = r.created_at
  )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.request_withdraw_keeps_fields(requests) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.request_withdraw_keeps_fields(requests) TO authenticated;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_withdraw_requests ON requests;--> statement-breakpoint
CREATE POLICY tenant_withdraw_requests ON requests
  FOR UPDATE USING (
    status = 'open'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = requests.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  )
  WITH CHECK (
    status = 'withdrawn'
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = requests.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
    AND private.request_withdraw_keeps_fields(requests)
  );
--> statement-breakpoint

-- 3. tenant_update_inventory_reconfirmation_items had no WITH CHECK at
--    all. A tenant answers a *pending* item of an *open* campaign once,
--    with confirmed | discrepancy (the UI only offers pending rows), and
--    may not re-point the row at another campaign or item, nor flip an
--    item the admin has since reviewed.
CREATE OR REPLACE FUNCTION private.reconfirmation_answer_keeps_fields(r inventory_reconfirmation_items)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM inventory_reconfirmation_items old
    WHERE old.id = r.id
      AND old.reconfirmation_id = r.reconfirmation_id
      AND old.inventory_item_id = r.inventory_item_id
      AND old.created_at = r.created_at
  )
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.reconfirmation_answer_keeps_fields(inventory_reconfirmation_items) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.reconfirmation_answer_keeps_fields(inventory_reconfirmation_items) TO authenticated;--> statement-breakpoint
DROP POLICY IF EXISTS tenant_update_inventory_reconfirmation_items ON inventory_reconfirmation_items;--> statement-breakpoint
CREATE POLICY tenant_update_inventory_reconfirmation_items ON inventory_reconfirmation_items
  FOR UPDATE USING (
    status = 'pending'
    AND EXISTS (
      SELECT 1 FROM inventory_reconfirmations r
      JOIN tenancies t ON t.id = r.tenancy_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE r.id = inventory_reconfirmation_items.reconfirmation_id
        AND r.status = 'open'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  )
  WITH CHECK (
    status IN ('confirmed', 'discrepancy')
    AND EXISTS (
      SELECT 1 FROM inventory_reconfirmations r
      JOIN tenancies t ON t.id = r.tenancy_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE r.id = inventory_reconfirmation_items.reconfirmation_id
        AND r.status = 'open'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
    AND private.reconfirmation_answer_keeps_fields(inventory_reconfirmation_items)
  );
