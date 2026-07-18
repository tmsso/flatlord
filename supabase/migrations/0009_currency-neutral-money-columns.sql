-- Currency-neutral money-column naming (CLAUDE.md §6). HUF is the only
-- currency in practice today, but baking it into column names couples the
-- schema to a currency that could change — see IDEAS.md ("EUR-based
-- pricing"). The `currency char(3)` columns already on `statements`/
-- `payments` carry the actual currency; the amount/rate columns themselves
-- should stay currency-agnostic. Renaming rather than drop+recreate even
-- though only synthetic dev data exists — matches this repo's own
-- never-hard-delete spirit and is no more work.

--> statement-breakpoint
ALTER TABLE charge_schedules RENAME COLUMN amount_huf TO amount;
--> statement-breakpoint
ALTER TABLE charge_schedules RENAME COLUMN rate_huf_per_unit TO rate_per_unit;
--> statement-breakpoint
ALTER TABLE adjustments RENAME COLUMN amount_huf TO amount;
--> statement-breakpoint
ALTER TABLE statements RENAME COLUMN total_huf TO total;
--> statement-breakpoint
ALTER TABLE statement_line_items RENAME COLUMN amount_huf TO amount;
--> statement-breakpoint
ALTER TABLE statement_line_items RENAME COLUMN unit_rate_huf TO unit_rate;
--> statement-breakpoint
ALTER TABLE payments RENAME COLUMN amount_huf TO amount;
--> statement-breakpoint

-- Trigger functions from 0008 reference these columns by name in their
-- bodies — Postgres does not auto-update function bodies on column
-- rename, so each must be recreated.

CREATE OR REPLACE FUNCTION charge_schedules_validate_kind() RETURNS trigger AS $$
DECLARE
  v_kind charge_type_kind;
BEGIN
  SELECT kind INTO v_kind FROM charge_types WHERE id = NEW.charge_type_id;
  IF v_kind IN ('tracked_only', 'one_off') THEN
    RAISE EXCEPTION 'charge_schedules cannot reference a % charge_type: tracked_only needs no rate, one_off belongs exclusively to adjustments', v_kind;
  ELSIF v_kind = 'fixed' AND (NEW.amount IS NULL OR NEW.rate_per_unit IS NOT NULL) THEN
    RAISE EXCEPTION 'a fixed charge_schedule requires amount and must not set rate_per_unit';
  ELSIF v_kind = 'metered' AND (NEW.rate_per_unit IS NULL OR NEW.amount IS NOT NULL) THEN
    RAISE EXCEPTION 'a metered charge_schedule requires rate_per_unit and must not set amount';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION statements_prevent_issued_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF NEW.total IS DISTINCT FROM OLD.total
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

CREATE OR REPLACE FUNCTION statements_recompute_status() RETURNS trigger AS $$
DECLARE
  v_statement_id uuid;
  v_total bigint;
  v_status statement_status;
  v_paid bigint;
BEGIN
  v_statement_id := COALESCE(NEW.statement_id, OLD.statement_id);
  SELECT total, status INTO v_total, v_status FROM statements WHERE id = v_statement_id;
  IF v_status = 'draft' THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO v_paid FROM payments WHERE statement_id = v_statement_id;
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
