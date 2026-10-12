-- B-36: a repair (or an inventory-discrepancy) request can name the
-- inventory item or facility (B-35) it is about. Optional, nullable FK.
-- Additive: old code never selects the column.
ALTER TABLE "requests" ADD COLUMN "inventory_item_id" uuid;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "requests_inventory_item_id_idx" ON "requests" USING btree ("inventory_item_id");--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_inventory_item_category_check" CHECK ("requests"."inventory_item_id" is null or "requests"."category" in ('repair', 'inventory'));--> statement-breakpoint

-- Scope: the item must be an *active* item of the request's own UNIT —
-- not merely the same root property (inventory_items.property_id is the
-- root, so a property check would let flat A name flat B's boiler). A
-- trigger rather than a policy clause so it holds for owner writes too and
-- adds no cross-table subquery to the requests policies. Re-checked only
-- when the item or tenancy changes, so retiring an item later never
-- blocks resolving the request that names it. SECURITY DEFINER in
-- `private` (0029) so the lookup isn't shaped by the caller's RLS.
CREATE OR REPLACE FUNCTION private.requests_inventory_item_scope()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.inventory_item_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.inventory_item_id IS NOT DISTINCT FROM OLD.inventory_item_id
     AND NEW.tenancy_id = OLD.tenancy_id THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM inventory_items i
    JOIN tenancies t ON t.unit_id = i.unit_id
    WHERE i.id = NEW.inventory_item_id AND t.id = NEW.tenancy_id AND i.status = 'active'
  ) THEN
    RAISE EXCEPTION 'inventory item is not an active item of this request''s unit'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'requests_inventory_item_scope';
  END IF;
  RETURN NEW;
END
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION private.requests_inventory_item_scope() FROM PUBLIC;--> statement-breakpoint
CREATE TRIGGER trg_requests_inventory_item_scope
  BEFORE INSERT OR UPDATE OF inventory_item_id, tenancy_id ON requests
  FOR EACH ROW EXECUTE FUNCTION private.requests_inventory_item_scope();--> statement-breakpoint

-- Withdrawing must not change the named item either (0029's pin list).
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
      AND old.inventory_item_id IS NOT DISTINCT FROM r.inventory_item_id
      AND old.initiated_by = r.initiated_by
      AND old.created_at = r.created_at
  )
$$;
