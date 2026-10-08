-- A tenant could previously insert a meter reading that was already
-- verified (status = 'verified', any confirmed_value), straight through the
-- Supabase API — tenant_insert_meter_readings only checked tenancy scope.
-- Only verified readings are billable (CLAUDE.md §3.4: "only verified
-- readings become billable"; the human-confirms rule), so that bypassed
-- the admin's verification step. The app's own submit action never did
-- this; the gap was reachable only by calling the REST API directly with
-- the tenant's session.
--
-- Now a tenant insert must be a plain submission: status 'submitted',
-- source 'tenant', nothing in the confirmation or OCR columns, and
-- entered_by = the caller's own person (no submitting as someone else).
-- Owner policies are unchanged. OCR proposals (Phase 5) are written
-- server-side, not by the tenant's client.
DROP POLICY IF EXISTS tenant_insert_meter_readings ON meter_readings;--> statement-breakpoint
CREATE POLICY tenant_insert_meter_readings ON meter_readings
  FOR INSERT WITH CHECK (
    meter_readings.status = 'submitted'
    AND meter_readings.source = 'tenant'
    AND meter_readings.confirmed_value IS NULL
    AND meter_readings.confirmed_by IS NULL
    AND meter_readings.confirmed_at IS NULL
    AND meter_readings.ocr_value IS NULL
    AND meter_readings.ocr_confidence IS NULL
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = meter_readings.tenancy_id AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
        AND pr.person_id = meter_readings.entered_by
    )
  );
