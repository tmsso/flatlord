CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"contract_clause_ref" text,
	"sequence" text,
	"requires_acknowledgement" boolean DEFAULT false NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"issued_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notices_type_check" CHECK ("notices"."type" in ('info', 'house_rule', 'payment_reminder', 'late_payment', 'formal_warning', 'contract')),
	CONSTRAINT "notices_sequence_check" CHECK ("notices"."sequence" is null or "notices"."sequence" in ('first', 'second', 'final'))
);
--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_entity_type_check";--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_acknowledged_by_persons_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notices" ADD CONSTRAINT "notices_issued_by_persons_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_entity_type_check" CHECK ("attachments"."entity_type" in ('tenancy', 'person', 'inventory_item', 'request', 'notice'));
--> statement-breakpoint

-- property_id denormalization (CLAUDE.md §3.8), trigger-set from
-- tenancy_id, same pattern as requests_set_property_id (migration 0019).
CREATE FUNCTION notices_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_notices_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON notices
  FOR EACH ROW EXECUTE FUNCTION notices_set_property_id();
--> statement-breakpoint

-- Immutable-once-issued (CLAUDE.md §3.8): a BEFORE UPDATE guard trigger
-- rejects any change to a column other than acknowledged_at/
-- acknowledged_by, for every update path (there is no way to express "no
-- other column differs from OLD" purely in RLS's WITH CHECK — it has no
-- OLD/NEW cross-reference; a plain USING/WITH CHECK pair like
-- tenant_withdraw_requests's only works for a known discrete single-column
-- transition, not a general "everything else stays put" guarantee). This
-- also closes the service-role/admin path, which an RLS policy never
-- would — there is deliberately no owner UPDATE policy on this table
-- below either, so combined with this trigger there is no way, through
-- any role, to edit an issued notice's content.
CREATE FUNCTION notices_guard_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.tenancy_id IS DISTINCT FROM OLD.tenancy_id
     OR NEW.property_id IS DISTINCT FROM OLD.property_id
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.body IS DISTINCT FROM OLD.body
     OR NEW.contract_clause_ref IS DISTINCT FROM OLD.contract_clause_ref
     OR NEW.sequence IS DISTINCT FROM OLD.sequence
     OR NEW.requires_acknowledgement IS DISTINCT FROM OLD.requires_acknowledgement
     OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'notices are immutable once issued (only acknowledged_at/acknowledged_by may change)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_notices_guard_immutable
  BEFORE UPDATE ON notices
  FOR EACH ROW EXECUTE FUNCTION notices_guard_immutable();
--> statement-breakpoint

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- notices: owner has SELECT + INSERT only in their properties' scope —
-- issuing is insert-only, no owner UPDATE/DELETE policy exists at all
-- (immutable once issued).
CREATE POLICY owner_scope_notices ON notices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = notices.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- INSERT WITH CHECK derives ownership from the submitted tenancy_id
-- directly (not the trigger-set property_id) — same caution as
-- owner_insert_requests (migration 0019).
CREATE POLICY owner_insert_notices ON notices
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = notices.tenancy_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_notices ON notices
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = notices.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- Tenant can only move a notice from "not yet acknowledged" to
-- "acknowledged", on their own tenancy's notice, and only when
-- requires_acknowledgement is true. WITH CHECK additionally pins
-- acknowledged_by to the caller's own person_id (no acknowledging on
-- someone else's behalf) and requires acknowledged_at to be set. Which
-- *other* columns are allowed to change is NOT this policy's job — that's
-- notices_guard_immutable() above; this policy only scopes which rows/
-- when, not what.
CREATE POLICY tenant_acknowledge_notices ON notices
  FOR UPDATE USING (
    requires_acknowledgement = true
    AND acknowledged_at IS NULL
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = notices.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  )
  WITH CHECK (
    acknowledged_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = notices.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
        AND pr.person_id = notices.acknowledged_by
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON notices TO authenticated;
--> statement-breakpoint

-- attachments on entity_type = 'notice': property_id denormalizes from
-- the parent notice's own property_id, mirroring the 'request' branch
-- added in migration 0019.
CREATE OR REPLACE FUNCTION attachments_set_property_id() RETURNS trigger AS $$
BEGIN
  IF NEW.entity_type = 'tenancy' THEN
    SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'inventory_item' THEN
    SELECT property_id INTO NEW.property_id FROM inventory_items WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'request' THEN
    SELECT property_id INTO NEW.property_id FROM requests WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'notice' THEN
    SELECT property_id INTO NEW.property_id FROM notices WHERE id = NEW.entity_id;
  ELSE
    NEW.property_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE POLICY owner_scope_attachments_notices ON attachments
  FOR SELECT USING (
    attachments.entity_type = 'notice'
    AND EXISTS (
      SELECT 1 FROM notices n
      JOIN property_ownership po ON po.property_id = n.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE n.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_attachments_notices ON attachments
  FOR INSERT WITH CHECK (
    entity_type = 'notice'
    AND EXISTS (
      SELECT 1 FROM notices n
      JOIN property_ownership po ON po.property_id = n.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE n.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- Owner can soft-delete/correct a mistakenly attached file even though the
-- parent notice's own content is immutable — same rationale as
-- owner_update_attachments_requests (migration 0019); attachments carry
-- their own deleted_at soft-delete flag independent of the notice's own
-- immutability.
CREATE POLICY owner_update_attachments_notices ON attachments
  FOR UPDATE USING (
    attachments.entity_type = 'notice'
    AND EXISTS (
      SELECT 1 FROM notices n
      JOIN property_ownership po ON po.property_id = n.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE n.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- Tenant: read-only. There is deliberately no tenant_insert_attachments_
-- notices policy — unlike requests (a tenant-initiated, conversational
-- entity), a notice is admin-issued and immutable, so there is nothing for
-- a tenant to ever attach to one.
CREATE POLICY tenant_scope_attachments_notices ON attachments
  FOR SELECT USING (
    attachments.deleted_at IS NULL
    AND attachments.entity_type = 'notice'
    AND EXISTS (
      SELECT 1 FROM notices n
      JOIN tenancies t ON t.id = n.tenancy_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE n.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );