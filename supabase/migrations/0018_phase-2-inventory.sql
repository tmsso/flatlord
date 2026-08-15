CREATE TYPE "public"."inventory_item_status" AS ENUM('active', 'removed', 'transferred');--> statement-breakpoint
CREATE TYPE "public"."inventory_owned_by" AS ENUM('owner', 'renter', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."inventory_reconfirmation_item_status" AS ENUM('pending', 'confirmed', 'discrepancy');--> statement-breakpoint
CREATE TYPE "public"."inventory_reconfirmation_scope" AS ENUM('full', 'subset');--> statement-breakpoint
CREATE TYPE "public"."inventory_reconfirmation_status" AS ENUM('open', 'completed');--> statement-breakpoint
CREATE TABLE "inventory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"unit_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owned_by" "inventory_owned_by" DEFAULT 'owner' NOT NULL,
	"condition" text,
	"notes" text,
	"action_by_date" date,
	"action_by_reason" text,
	"status" "inventory_item_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_reconfirmation_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reconfirmation_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"status" "inventory_reconfirmation_item_status" DEFAULT 'pending' NOT NULL,
	"tenant_note" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_reconfirmation_items_unique" UNIQUE("reconfirmation_id","inventory_item_id")
);
--> statement-breakpoint
CREATE TABLE "inventory_reconfirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"scope" "inventory_reconfirmation_scope" NOT NULL,
	"status" "inventory_reconfirmation_status" DEFAULT 'open' NOT NULL,
	"initiated_by" uuid NOT NULL,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"due_date" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The BEFORE ... OF entity_type trigger AND all four entity_type-
-- referencing RLS policies from migration 0017 depend on this column
-- (Postgres tracks both via their definitions), which blocks ALTER COLUMN
-- TYPE outright ("cannot alter type of a column used in a trigger/policy
-- definition") — drop them first, recreate afterward (policies unchanged
-- in substance — 'tenancy'/'person' string comparisons work identically
-- against text as they did against the enum; the trigger gains the
-- 'inventory_item' branch, see further down).
DROP TRIGGER trg_attachments_set_property_id ON attachments;--> statement-breakpoint
DROP POLICY owner_scope_attachments ON attachments;--> statement-breakpoint
DROP POLICY owner_insert_attachments ON attachments;--> statement-breakpoint
DROP POLICY owner_update_attachments ON attachments;--> statement-breakpoint
DROP POLICY tenant_scope_attachments ON attachments;--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "entity_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_unit_id_properties_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reconfirmation_items" ADD CONSTRAINT "inventory_reconfirmation_items_reconfirmation_id_inventory_reconfirmations_id_fk" FOREIGN KEY ("reconfirmation_id") REFERENCES "public"."inventory_reconfirmations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reconfirmation_items" ADD CONSTRAINT "inventory_reconfirmation_items_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reconfirmations" ADD CONSTRAINT "inventory_reconfirmations_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_reconfirmations" ADD CONSTRAINT "inventory_reconfirmations_initiated_by_persons_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_entity_type_check" CHECK ("attachments"."entity_type" in ('tenancy', 'person', 'inventory_item'));--> statement-breakpoint
DROP TYPE "public"."attachment_entity_type";--> statement-breakpoint

-- Recreate the four policies dropped above, unchanged from migration 0017
-- (string comparisons against 'person'/'tenancy' behave identically on
-- text as they did on the enum).
CREATE POLICY owner_scope_attachments ON attachments
  FOR SELECT USING (
    (
      attachments.entity_type = 'person'
      AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
    )
    OR (
      attachments.entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        JOIN property_ownership po ON po.property_id = t.property_id
        JOIN profiles pr ON pr.person_id = po.person_id
        WHERE t.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
      )
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_attachments ON attachments
  FOR INSERT WITH CHECK (
    (
      entity_type = 'person'
      AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
    )
    OR (
      entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        JOIN property_ownership po ON po.property_id = t.property_id
        JOIN profiles pr ON pr.person_id = po.person_id
        WHERE t.id = entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
      )
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_attachments ON attachments
  FOR UPDATE USING (
    (
      attachments.entity_type = 'person'
      AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
    )
    OR (
      attachments.entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        JOIN property_ownership po ON po.property_id = t.property_id
        JOIN profiles pr ON pr.person_id = po.person_id
        WHERE t.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
      )
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_attachments ON attachments
  FOR SELECT USING (
    attachments.deleted_at IS NULL
    AND (
      (
        attachments.entity_type = 'person'
        AND EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'tenant' AND pr.person_id = attachments.entity_id)
      )
      OR (
        attachments.entity_type = 'tenancy'
        AND EXISTS (
          SELECT 1 FROM tenancies t
          JOIN profiles pr ON pr.person_id = t.primary_tenant_id
          WHERE t.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'tenant'
        )
      )
    )
  );
--> statement-breakpoint

-- Recreate the trigger dropped above, now also handling entity_type =
-- 'inventory_item' (denormalizes from inventory_items' own root
-- property_id, same as the 'tenancy' branch denormalizes from
-- tenancies.property_id).
CREATE OR REPLACE FUNCTION attachments_set_property_id() RETURNS trigger AS $$
BEGIN
  IF NEW.entity_type = 'tenancy' THEN
    SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'inventory_item' THEN
    SELECT property_id INTO NEW.property_id FROM inventory_items WHERE id = NEW.entity_id;
  ELSE
    NEW.property_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_attachments_set_property_id
  BEFORE INSERT OR UPDATE OF entity_type, entity_id ON attachments
  FOR EACH ROW EXECUTE FUNCTION attachments_set_property_id();
--> statement-breakpoint

-- Denormalization triggers. inventory_items mirrors meters_set_property_id
-- (migration 0008) exactly: property_id is the ROOT property (owner RLS
-- scope), unit_id is the real lettable node (tenant RLS scope) — meters
-- already established this split is required to avoid leaking a sibling
-- flat's data under the same root property to the wrong tenant, and
-- inventory items have the identical shape (per-unit fixtures).
CREATE FUNCTION inventory_items_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT root_property_id INTO NEW.property_id FROM properties WHERE id = NEW.unit_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_inventory_items_set_property_id
  BEFORE INSERT OR UPDATE OF unit_id ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION inventory_items_set_property_id();
--> statement-breakpoint

-- inventory_reconfirmations mirrors contracts_set_property_id (migration
-- 0015) — campaign is tenancy-scoped, property_id denormalized for owner
-- RLS only; tenant RLS scopes via tenancy_id -> primary_tenant_id
-- directly, same as tenant_scope_contracts.
CREATE FUNCTION inventory_reconfirmations_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_inventory_reconfirmations_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON inventory_reconfirmations
  FOR EACH ROW EXECUTE FUNCTION inventory_reconfirmations_set_property_id();
--> statement-breakpoint

ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE inventory_reconfirmations ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE inventory_reconfirmation_items ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- inventory_items: owner full CRUD (soft-remove/transfer via status, never
-- DELETE), tenant read-only on their own active tenancy's unit.
CREATE POLICY owner_scope_inventory_items ON inventory_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = inventory_items.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- INSERT WITH CHECK derives ownership from the submitted unit_id directly
-- (not the trigger-set property_id column) — same caution as
-- owner_insert_contracts (migration 0015), which does the equivalent via
-- tenancy_id rather than trusting a column a BEFORE trigger just set.
CREATE POLICY owner_insert_inventory_items ON inventory_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM properties p
      JOIN property_ownership po ON po.property_id = p.root_property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE p.id = inventory_items.unit_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_inventory_items ON inventory_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = inventory_items.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_inventory_items ON inventory_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.unit_id = inventory_items.unit_id AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON inventory_items TO authenticated;
--> statement-breakpoint

-- inventory_reconfirmations: campaign lifecycle is admin-only; tenant
-- read-only (never writes to the campaign row itself, only to its items).
CREATE POLICY owner_scope_inventory_reconfirmations ON inventory_reconfirmations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = inventory_reconfirmations.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_inventory_reconfirmations ON inventory_reconfirmations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = inventory_reconfirmations.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_inventory_reconfirmations ON inventory_reconfirmations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = inventory_reconfirmations.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_inventory_reconfirmations ON inventory_reconfirmations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = inventory_reconfirmations.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON inventory_reconfirmations TO authenticated;
--> statement-breakpoint

-- inventory_reconfirmation_items: owner full CRUD (creates the rows when
-- launching a campaign, can review/clear a discrepancy); tenant SELECT +
-- UPDATE on their own campaign's rows only (records confirm/discrepancy),
-- never INSERT (rows only ever come from the admin launching the
-- campaign) or DELETE.
CREATE POLICY owner_scope_inventory_reconfirmation_items ON inventory_reconfirmation_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM inventory_reconfirmations r
      JOIN property_ownership po ON po.property_id = r.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE r.id = inventory_reconfirmation_items.reconfirmation_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_inventory_reconfirmation_items ON inventory_reconfirmation_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM inventory_reconfirmations r
      JOIN property_ownership po ON po.property_id = r.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE r.id = inventory_reconfirmation_items.reconfirmation_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_inventory_reconfirmation_items ON inventory_reconfirmation_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM inventory_reconfirmations r
      JOIN property_ownership po ON po.property_id = r.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE r.id = inventory_reconfirmation_items.reconfirmation_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_inventory_reconfirmation_items ON inventory_reconfirmation_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM inventory_reconfirmations r
      JOIN tenancies t ON t.id = r.tenancy_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE r.id = inventory_reconfirmation_items.reconfirmation_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_update_inventory_reconfirmation_items ON inventory_reconfirmation_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM inventory_reconfirmations r
      JOIN tenancies t ON t.id = r.tenancy_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE r.id = inventory_reconfirmation_items.reconfirmation_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON inventory_reconfirmation_items TO authenticated;
--> statement-breakpoint

-- attachments: extend to entity_type = 'inventory_item'. Additive policies
-- alongside the existing tenancy/person ones from migration 0017 —
-- Postgres ORs multiple permissive policies for the same command, so this
-- doesn't touch the shipped 0017 policies at all. Owner scoped via
-- inventory_items -> property_ownership (same join idiom as
-- owner_scope_inventory_items); tenant read scoped the same way as
-- tenant_scope_inventory_items (active tenancy on the item's unit).
CREATE POLICY owner_scope_attachments_inventory ON attachments
  FOR SELECT USING (
    attachments.entity_type = 'inventory_item'
    AND EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN property_ownership po ON po.property_id = ii.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE ii.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_attachments_inventory ON attachments
  FOR INSERT WITH CHECK (
    entity_type = 'inventory_item'
    AND EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN property_ownership po ON po.property_id = ii.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE ii.id = entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_attachments_inventory ON attachments
  FOR UPDATE USING (
    attachments.entity_type = 'inventory_item'
    AND EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN property_ownership po ON po.property_id = ii.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE ii.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_attachments_inventory ON attachments
  FOR SELECT USING (
    attachments.deleted_at IS NULL
    AND attachments.entity_type = 'inventory_item'
    AND EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN tenancies t ON t.unit_id = ii.unit_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE ii.id = attachments.entity_id AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- Tenant INSERT, scoped identically to tenant_scope_attachments_inventory
-- above — the one deliberate exception to item 4's "admin-only upload"
-- precedent: CLAUDE.md §3.9 requires an optional tenant-supplied photo when
-- confirming/flagging a reconfirmation item, which needs a real tenant
-- write path. Scope stays narrow: only entity_type = 'inventory_item', only
-- on their own active tenancy's unit. See
-- src/server/inventory/submit-reconfirmation-response.ts.
CREATE POLICY tenant_insert_attachments_inventory ON attachments
  FOR INSERT WITH CHECK (
    entity_type = 'inventory_item'
    AND EXISTS (
      SELECT 1 FROM inventory_items ii
      JOIN tenancies t ON t.unit_id = ii.unit_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE ii.id = entity_id AND t.status = 'active'
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );