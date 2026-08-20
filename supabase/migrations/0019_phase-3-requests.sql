CREATE TABLE "request_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenancy_id" uuid NOT NULL,
	"property_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"external_case_ref" text,
	"appointment_date" timestamp with time zone,
	"change_payload" jsonb,
	"initiated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requests_category_check" CHECK ("requests"."category" in ('repair', 'contract_change', 'personal_data_change', 'inventory', 'billing_question', 'other')),
	CONSTRAINT "requests_status_check" CHECK ("requests"."status" in ('open', 'resolved', 'rejected', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_entity_type_check";--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_request_id_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "request_messages" ADD CONSTRAINT "request_messages_author_id_persons_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_tenancy_id_tenancies_id_fk" FOREIGN KEY ("tenancy_id") REFERENCES "public"."tenancies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requests" ADD CONSTRAINT "requests_initiated_by_persons_id_fk" FOREIGN KEY ("initiated_by") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_entity_type_check" CHECK ("attachments"."entity_type" in ('tenancy', 'person', 'inventory_item', 'request'));
--> statement-breakpoint

-- property_id denormalization (ROADMAP Phase 3 item 1): trigger-set from
-- tenancy_id, same pattern as inventory_reconfirmations_set_property_id
-- (migration 0018).
CREATE FUNCTION requests_set_property_id() RETURNS trigger AS $$
BEGIN
  SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.tenancy_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_requests_set_property_id
  BEFORE INSERT OR UPDATE OF tenancy_id ON requests
  FOR EACH ROW EXECUTE FUNCTION requests_set_property_id();
--> statement-breakpoint

ALTER TABLE requests ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE request_messages ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- requests: owner full CRUD in their properties' scope (open/reply/
-- resolve/reject); tenant can SELECT their own tenancy's requests, INSERT
-- new ones, and UPDATE only to withdraw an open one of their own (see the
-- separate tenant_withdraw_requests policy below — a plain FOR UPDATE
-- USING clause can't also restrict the *target* status, so withdrawal
-- gets a dedicated WITH CHECK).
CREATE POLICY owner_scope_requests ON requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = requests.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_requests ON requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = requests.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- INSERT WITH CHECK derives ownership from the submitted tenancy_id
-- directly (not the trigger-set property_id) — same caution as
-- owner_insert_inventory_reconfirmations (migration 0018). Owners can
-- open a request on a tenant's behalf (e.g. logging a repair call).
CREATE POLICY owner_insert_requests ON requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = requests.tenancy_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_requests ON requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = requests.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_insert_requests ON requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = requests.tenancy_id
        AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- Tenant can only move their own OPEN request to 'withdrawn' — resolve/
-- reject stay admin-only transitions. WITH CHECK re-validates the row
-- *after* the update, so it also blocks setting status to anything else.
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
  );
--> statement-breakpoint

GRANT SELECT, INSERT, UPDATE ON requests TO authenticated;
--> statement-breakpoint

-- request_messages: both sides can read + write on a request they can see
-- (RLS on the parent `requests` row already scopes this — no separate
-- role branch needed here beyond "can I see the parent request").
CREATE POLICY scope_request_messages ON request_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM requests r WHERE r.id = request_messages.request_id)
  );
--> statement-breakpoint

CREATE POLICY owner_insert_request_messages ON request_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM requests r
      JOIN property_ownership po ON po.property_id = r.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE r.id = request_messages.request_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_insert_request_messages ON request_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM requests r
      JOIN tenancies t ON t.id = r.tenancy_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE r.id = request_messages.request_id AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

GRANT SELECT, INSERT ON request_messages TO authenticated;
--> statement-breakpoint

-- attachments on entity_type = 'request': property_id denormalizes from
-- the parent request's own property_id, mirroring the 'inventory_item'
-- branch added in migration 0019's attachments trigger update below.
CREATE OR REPLACE FUNCTION attachments_set_property_id() RETURNS trigger AS $$
BEGIN
  IF NEW.entity_type = 'tenancy' THEN
    SELECT property_id INTO NEW.property_id FROM tenancies WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'inventory_item' THEN
    SELECT property_id INTO NEW.property_id FROM inventory_items WHERE id = NEW.entity_id;
  ELSIF NEW.entity_type = 'request' THEN
    SELECT property_id INTO NEW.property_id FROM requests WHERE id = NEW.entity_id;
  ELSE
    NEW.property_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE POLICY owner_scope_attachments_requests ON attachments
  FOR SELECT USING (
    attachments.entity_type = 'request'
    AND EXISTS (
      SELECT 1 FROM requests r
      JOIN property_ownership po ON po.property_id = r.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE r.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_attachments_requests ON attachments
  FOR INSERT WITH CHECK (
    entity_type = 'request'
    AND EXISTS (
      SELECT 1 FROM requests r
      JOIN property_ownership po ON po.property_id = r.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE r.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_attachments_requests ON attachments
  FOR UPDATE USING (
    attachments.entity_type = 'request'
    AND EXISTS (
      SELECT 1 FROM requests r
      JOIN property_ownership po ON po.property_id = r.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE r.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_attachments_requests ON attachments
  FOR SELECT USING (
    attachments.deleted_at IS NULL
    AND attachments.entity_type = 'request'
    AND EXISTS (
      SELECT 1 FROM requests r
      JOIN tenancies t ON t.id = r.tenancy_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE r.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- Tenant can attach documents when opening/replying to their own request
-- (§3.7: "threaded replies/documents both ways"), mirroring the one
-- existing tenant-write attachments exception (reconfirmation photos,
-- migration 0018/0019's tenant_insert_attachments_inventory).
CREATE POLICY tenant_insert_attachments_requests ON attachments
  FOR INSERT WITH CHECK (
    entity_type = 'request'
    AND EXISTS (
      SELECT 1 FROM requests r
      JOIN tenancies t ON t.id = r.tenancy_id
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE r.id = attachments.entity_id AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );