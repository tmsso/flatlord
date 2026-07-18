-- Billing/meter core (Phase 1 M1): denormalization triggers, cross-row
-- invariants Postgres CHECKs can't express, issued-statement immutability,
-- payment-driven status recompute, and RLS + grants for all 9 new tables.
-- Mirrors the idioms established in 0001/0005/0006.

--> statement-breakpoint

-- 1. Denormalization: property_id (and, for statement_line_items/payments,
-- tenancy_id too) is always trigger-set from the parent row, never trusted
-- from app input — same unconditional-overwrite pattern as
-- trg_tenancies_validate_unit.

CREATE FUNCTION charge_types_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT root_property_id INTO NEW.property_id FROM properties WHERE id = NEW.unit_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_charge_types_set_property_id
  BEFORE INSERT OR UPDATE OF unit_id ON charge_types
  FOR EACH ROW EXECUTE FUNCTION charge_types_set_property_id();
--> statement-breakpoint

CREATE FUNCTION meters_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT root_property_id INTO NEW.property_id FROM properties WHERE id = NEW.unit_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_meters_set_property_id
  BEFORE INSERT OR UPDATE OF unit_id ON meters
  FOR EACH ROW EXECUTE FUNCTION meters_set_property_id();
--> statement-breakpoint

CREATE FUNCTION charge_schedules_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_charge_schedules_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON charge_schedules
  FOR EACH ROW EXECUTE FUNCTION charge_schedules_set_property_id();
--> statement-breakpoint

CREATE FUNCTION adjustments_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_adjustments_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON adjustments
  FOR EACH ROW EXECUTE FUNCTION adjustments_set_property_id();
--> statement-breakpoint

CREATE FUNCTION meter_readings_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_meter_readings_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON meter_readings
  FOR EACH ROW EXECUTE FUNCTION meter_readings_set_property_id();
--> statement-breakpoint

CREATE FUNCTION statements_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_statements_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON statements
  FOR EACH ROW EXECUTE FUNCTION statements_set_property_id();
--> statement-breakpoint

CREATE FUNCTION statement_line_items_set_scope() RETURNS trigger AS $$
BEGIN
  SELECT tenancy_id, property_id INTO NEW.tenancy_id, NEW.property_id
  FROM statements WHERE id = NEW.statement_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_statement_line_items_set_scope
  BEFORE INSERT OR UPDATE OF statement_id ON statement_line_items
  FOR EACH ROW EXECUTE FUNCTION statement_line_items_set_scope();
--> statement-breakpoint

CREATE FUNCTION payments_set_scope() RETURNS trigger AS $$
BEGIN
  SELECT tenancy_id, property_id INTO NEW.tenancy_id, NEW.property_id
  FROM statements WHERE id = NEW.statement_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_payments_set_scope
  BEFORE INSERT OR UPDATE OF statement_id ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_set_scope();
--> statement-breakpoint

-- 2. charge_schedules kind-gating: cross-table check against
-- charge_types.kind, not expressible as a plain CHECK. tracked_only/one_off
-- are rejected outright (tracked-only needs no rate; one_off belongs
-- exclusively to adjustments); fixed/metered each require exactly one of
-- amount_huf/rate_huf_per_unit.
CREATE FUNCTION charge_schedules_validate_kind() RETURNS trigger AS $$
DECLARE
  v_kind charge_type_kind;
BEGIN
  SELECT kind INTO v_kind FROM charge_types WHERE id = NEW.charge_type_id;
  IF v_kind IN ('tracked_only', 'one_off') THEN
    RAISE EXCEPTION 'charge_schedules cannot reference a % charge_type: tracked_only needs no rate, one_off belongs exclusively to adjustments', v_kind;
  ELSIF v_kind = 'fixed' AND (NEW.amount_huf IS NULL OR NEW.rate_huf_per_unit IS NOT NULL) THEN
    RAISE EXCEPTION 'a fixed charge_schedule requires amount_huf and must not set rate_huf_per_unit';
  ELSIF v_kind = 'metered' AND (NEW.rate_huf_per_unit IS NULL OR NEW.amount_huf IS NOT NULL) THEN
    RAISE EXCEPTION 'a metered charge_schedule requires rate_huf_per_unit and must not set amount_huf';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_charge_schedules_validate_kind
  BEFORE INSERT OR UPDATE OF charge_type_id, amount_huf, rate_huf_per_unit ON charge_schedules
  FOR EACH ROW EXECUTE FUNCTION charge_schedules_validate_kind();
--> statement-breakpoint

-- 3. meters must reference a metered/tracked_only charge_type.
CREATE FUNCTION meters_validate_charge_type_kind() RETURNS trigger AS $$
DECLARE
  v_kind charge_type_kind;
BEGIN
  SELECT kind INTO v_kind FROM charge_types WHERE id = NEW.charge_type_id;
  IF v_kind NOT IN ('metered', 'tracked_only') THEN
    RAISE EXCEPTION 'a meter must reference a metered or tracked_only charge_type, got %', v_kind;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_meters_validate_charge_type_kind
  BEFORE INSERT OR UPDATE OF charge_type_id ON meters
  FOR EACH ROW EXECUTE FUNCTION meters_validate_charge_type_kind();
--> statement-breakpoint

-- 4. meter_readings: the referenced meter must belong to the same unit as
-- the referenced tenancy (mirrors tenancies_validate_unit's cross-check
-- style) — this is what lets meters persist across tenancy turnover while
-- still catching a reading submitted against the wrong tenancy/meter pair.
CREATE FUNCTION meter_readings_validate_meter_tenancy() RETURNS trigger AS $$
DECLARE
  v_meter_unit uuid;
  v_tenancy_unit uuid;
BEGIN
  SELECT unit_id INTO v_meter_unit FROM meters WHERE id = NEW.meter_id;
  SELECT unit_id INTO v_tenancy_unit FROM tenancies WHERE id = NEW.tenancy_id;
  IF v_meter_unit IS DISTINCT FROM v_tenancy_unit THEN
    RAISE EXCEPTION 'meter % (unit %) does not belong to tenancy % (unit %)', NEW.meter_id, v_meter_unit, NEW.tenancy_id, v_tenancy_unit;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_meter_readings_validate_meter_tenancy
  BEFORE INSERT OR UPDATE OF meter_id, tenancy_id ON meter_readings
  FOR EACH ROW EXECUTE FUNCTION meter_readings_validate_meter_tenancy();
--> statement-breakpoint

-- 5. charge_schedules overlap guard: no two schedules for the same
-- (tenancy_id, charge_type_id) may have overlapping [valid_from, valid_to)
-- ranges. Deferred constraint trigger, same idiom as
-- trg_properties_letting_exclusivity (0001) — deliberately not
-- EXCLUDE USING gist, which would need the btree_gist extension; this repo
-- already has a working trigger idiom for exactly this shape of problem.
CREATE FUNCTION charge_schedules_check_no_overlap() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM charge_schedules cs
    WHERE cs.id <> NEW.id
      AND cs.tenancy_id = NEW.tenancy_id
      AND cs.charge_type_id = NEW.charge_type_id
      AND daterange(cs.valid_from, coalesce(cs.valid_to, 'infinity'::date), '[)')
          && daterange(NEW.valid_from, coalesce(NEW.valid_to, 'infinity'::date), '[)')
  ) THEN
    RAISE EXCEPTION 'overlapping charge_schedule for tenancy % / charge_type %', NEW.tenancy_id, NEW.charge_type_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER trg_charge_schedules_check_no_overlap
  AFTER INSERT OR UPDATE OF tenancy_id, charge_type_id, valid_from, valid_to ON charge_schedules
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION charge_schedules_check_no_overlap();
--> statement-breakpoint

-- 6. Issued-statement immutability (CLAUDE.md §3.3: "never edits to issued
-- statements"). Once a statement leaves draft, only its status may change
-- thereafter (driven by trg_statements_recompute_status below) — every
-- other column is frozen.
CREATE FUNCTION statements_prevent_issued_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.total_huf IS DISTINCT FROM OLD.total_huf
       OR NEW.due_date IS DISTINCT FROM OLD.due_date
       OR NEW.issued_snapshot IS DISTINCT FROM OLD.issued_snapshot
       OR NEW.period_month IS DISTINCT FROM OLD.period_month
       OR NEW.tenancy_id IS DISTINCT FROM OLD.tenancy_id THEN
      RAISE EXCEPTION 'statement % is issued: only status may change after issue', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_statements_prevent_issued_mutation
  BEFORE UPDATE ON statements
  FOR EACH ROW EXECUTE FUNCTION statements_prevent_issued_mutation();
--> statement-breakpoint

-- Same rule for the child rows, since that's where the actual snapshot
-- content lives — once the parent statement is issued, line items can
-- neither be edited nor removed.
CREATE FUNCTION statement_line_items_prevent_issued_mutation() RETURNS trigger AS $$
DECLARE
  v_status statement_status;
BEGIN
  SELECT status INTO v_status FROM statements WHERE id = COALESCE(NEW.statement_id, OLD.statement_id);
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'statement % is issued: line items are immutable', COALESCE(NEW.statement_id, OLD.statement_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_statement_line_items_prevent_issued_mutation
  BEFORE UPDATE OR DELETE ON statement_line_items
  FOR EACH ROW EXECUTE FUNCTION statement_line_items_prevent_issued_mutation();
--> statement-breakpoint

-- 7. Payments drive statement status forward — the one place status
-- changes post-issue, so the app never has to remember to do it manually.
-- Payments against a still-draft statement (shouldn't happen, but not
-- structurally prevented) don't drive status.
CREATE FUNCTION statements_recompute_status() RETURNS trigger AS $$
DECLARE
  v_statement_id uuid;
  v_total bigint;
  v_status statement_status;
  v_paid bigint;
BEGIN
  v_statement_id := COALESCE(NEW.statement_id, OLD.statement_id);
  SELECT total_huf, status INTO v_total, v_status FROM statements WHERE id = v_statement_id;
  IF v_status = 'draft' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(amount_huf), 0) INTO v_paid FROM payments WHERE statement_id = v_statement_id;
  UPDATE statements
  SET status = (CASE
    WHEN v_paid <= 0 THEN 'issued'
    WHEN v_paid < v_total THEN 'partially_paid'
    ELSE 'paid'
  END)::statement_status
  WHERE id = v_statement_id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_statements_recompute_status
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION statements_recompute_status();
--> statement-breakpoint

-- Row Level Security. Owners scope by the denormalized property_id
-- (matching owner_scope_tenancies); tenants scope through tenancies ->
-- primary_tenant_id (matching tenant_scope_tenancy_occupants). charge_types
-- and meters are unit-scoped, not tenancy-scoped (they persist across
-- tenancy turnover), so their tenant policy joins on unit_id + an active
-- tenancy instead. charge_schedules/adjustments get no tenant policy at
-- all — the negotiated rate isn't portal content, line items already carry
-- the rendered description/amount.

ALTER TABLE charge_types ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE charge_schedules ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE adjustments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE meters ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE meter_readings ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE statements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE statement_line_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE field_requirements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- charge_types
CREATE POLICY owner_scope_charge_types ON charge_types
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = charge_types.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_charge_types ON charge_types
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = charge_types.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_charge_types ON charge_types
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = charge_types.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_charge_types ON charge_types
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.unit_id = charge_types.unit_id AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- charge_schedules (owner-only, no tenant policy)
CREATE POLICY owner_scope_charge_schedules ON charge_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = charge_schedules.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_charge_schedules ON charge_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = charge_schedules.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_charge_schedules ON charge_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = charge_schedules.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- adjustments (owner-only, no tenant policy)
CREATE POLICY owner_scope_adjustments ON adjustments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = adjustments.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_adjustments ON adjustments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = adjustments.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_adjustments ON adjustments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = adjustments.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- meters
CREATE POLICY owner_scope_meters ON meters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = meters.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_meters ON meters
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = meters.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_meters ON meters
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = meters.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_meters ON meters
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.unit_id = meters.unit_id AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- meter_readings: owner full CRUD (verification), tenant SELECT own +
-- INSERT own (no tenant UPDATE — only admin verifies/edits).
CREATE POLICY owner_scope_meter_readings ON meter_readings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = meter_readings.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_meter_readings ON meter_readings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = meter_readings.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_meter_readings ON meter_readings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = meter_readings.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_meter_readings ON meter_readings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = meter_readings.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_insert_meter_readings ON meter_readings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = meter_readings.tenancy_id AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- statements
CREATE POLICY owner_scope_statements ON statements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statements.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_statements ON statements
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statements.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_statements ON statements
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statements.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_statements ON statements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = statements.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- statement_line_items (owner may also delete draft rows; the immutability
-- trigger blocks it once the parent statement is issued)
CREATE POLICY owner_scope_statement_line_items ON statement_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statement_line_items.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_statement_line_items ON statement_line_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statement_line_items.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_statement_line_items ON statement_line_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statement_line_items.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_delete_statement_line_items ON statement_line_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = statement_line_items.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_statement_line_items ON statement_line_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = statement_line_items.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- payments
CREATE POLICY owner_scope_payments ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = payments.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_payments ON payments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = payments.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_payments ON payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = payments.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_payments ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = payments.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- field_requirements: admin-only reference table, same shape as
-- field_policies in 0001.
CREATE POLICY owner_scope_field_requirements ON field_requirements
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

-- Grants (CLAUDE.md/0006 lesson: RLS policies alone are not sufficient,
-- Postgres also requires a table-level GRANT). Each line mirrors exactly
-- the operations that table's policies above allow.
GRANT SELECT, INSERT, UPDATE ON charge_types TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON charge_schedules TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON adjustments TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON meters TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON meter_readings TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON statements TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON statement_line_items TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON payments TO authenticated;
--> statement-breakpoint
GRANT SELECT ON field_requirements TO authenticated;
