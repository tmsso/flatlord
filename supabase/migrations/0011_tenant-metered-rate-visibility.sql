-- Scoped exception to charge_schedules' owner-only visibility (0008):
-- tenants may see the *currently active* rate for their own tenancy's
-- *metered* charge types only — never fixed/one_off amounts (rent stays
-- invisible, preserving the original "negotiated rate isn't portal
-- content" intent) and never past/future-dated rows (no rate history).
-- Lets the tenant meter-reading flow show a live cost estimate while
-- entering a value, using the same selection rule as pickActiveSchedule
-- in compute-statement.ts (schedule covering "now"), not a separate one.
-- Does not touch or widen owner_scope_charge_schedules.

CREATE POLICY tenant_scope_metered_charge_schedules ON charge_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      JOIN charge_types ct ON ct.id = charge_schedules.charge_type_id
      WHERE t.id = charge_schedules.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
        AND ct.kind = 'metered'
        AND charge_schedules.valid_from <= current_date
        AND (charge_schedules.valid_to IS NULL OR charge_schedules.valid_to >= current_date)
    )
  );