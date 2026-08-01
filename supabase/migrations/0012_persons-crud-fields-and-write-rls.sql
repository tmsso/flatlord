ALTER TABLE "persons" ADD COLUMN "birth_name" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "birth_place" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "mothers_name" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "citizenship" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "address_card_number" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "tax_id" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "registered_address" text;--> statement-breakpoint
ALTER TABLE "persons" ADD COLUMN "temporary_address" text;
--> statement-breakpoint

-- Write access for the admin property/tenancy/person CRUD (ROADMAP Phase
-- 1). Every policy below was SELECT-only through migration 0006 — this is
-- the first migration that lets an owner actually create/edit these rows
-- through the app (previously only reachable by direct DB/seed access).
--
-- Postgres RLS forbids a policy from containing a subquery that reads the
-- same table the policy is defined on — it throws "infinite recursion
-- detected in policy for relation X" unconditionally, even when the
-- subquery is logically non-recursive (confirmed the hard way against
-- this dev project: a first draft of owner_insert_properties queried
-- `properties parent` from inside a policy on `properties`, and the very
-- first insert through the app failed with exactly that error). The fix
-- is the standard Postgres workaround: move the self-referencing read
-- into a SECURITY DEFINER function. Its body runs as the function owner
-- (the migration role), which RLS doesn't restrict by default (no FORCE
-- ROW LEVEL SECURITY is set anywhere in this schema), so the nested read
-- bypasses RLS entirely instead of re-entering the policy that called it.
-- SET search_path = public matches handle_new_user's existing convention
-- (migration 0004) — pins the search path so a SECURITY DEFINER function
-- can't be tricked by a caller-controlled search_path.
CREATE FUNCTION property_root_id(check_id uuid) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT root_property_id FROM properties WHERE id = check_id;
$$;
--> statement-breakpoint

CREATE FUNCTION property_ownership_row_exists(check_property_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM property_ownership WHERE property_id = check_property_id);
$$;
--> statement-breakpoint

CREATE FUNCTION property_owned_by(check_property_id uuid, check_user_id uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM property_ownership po
    JOIN profiles pr ON pr.person_id = po.person_id
    WHERE po.property_id = check_property_id
      AND pr.id = check_user_id AND pr.role = 'owner'
  );
$$;
--> statement-breakpoint

-- properties: root-level inserts (a brand-new house or a top-level flat)
-- have no property_ownership row yet, so they can't be checked against
-- ownership — anyone with role='owner' may insert a root row (parent_id
-- is null and root_property_id = id, enforced by the app, not this
-- policy). Child inserts (rooms, or flats under a house) are checked
-- against ownership of the parent's root, same join shape as
-- owner_scope_properties' SELECT policy — just routed through
-- property_root_id()/property_owned_by() to avoid the self-reference.
CREATE POLICY owner_insert_properties ON properties
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
    AND (
      properties.parent_id IS NULL
      OR property_owned_by(property_root_id(properties.parent_id), auth.uid())
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_properties ON properties
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = properties.root_property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- property_ownership: an owner may grant/adjust ownership shares only for
-- root properties they (or a co-owner) already own — same chicken-and-egg
-- as properties above, so the very first ownership row for a brand-new
-- root is inserted in the same transaction as the property itself, guarded
-- only by role='owner'; subsequent co-owner rows are checked against
-- existing ownership of that root. Same self-reference problem as
-- properties above (this policy is ON property_ownership and would
-- otherwise query property_ownership directly) — routed through the same
-- two SECURITY DEFINER functions.
CREATE POLICY owner_insert_property_ownership ON property_ownership
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
    AND (
      NOT property_ownership_row_exists(property_ownership.property_id)
      OR property_owned_by(property_ownership.property_id, auth.uid())
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_property_ownership ON property_ownership
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'owner' AND pr.person_id = property_ownership.person_id
    )
  );
--> statement-breakpoint

-- tenancies: owner may insert/update tenancies for properties they own.
CREATE POLICY owner_insert_tenancies ON tenancies
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = tenancies.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_tenancies ON tenancies
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = tenancies.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- tenancy_occupants: owner manages co-occupants for tenancies on
-- properties they own.
CREATE POLICY owner_insert_tenancy_occupants ON tenancy_occupants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = tenancy_occupants.tenancy_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_tenancy_occupants ON tenancy_occupants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = tenancy_occupants.tenancy_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

-- persons: owner manages all person records (tenants, co-occupants,
-- owners, agents) — same scope as owner_scope_persons' SELECT policy.
CREATE POLICY owner_insert_persons ON persons
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

CREATE POLICY owner_update_persons ON persons
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

-- audit_log: append-only from the app's perspective — owner can insert
-- rows (every CRUD mutation logs one), nobody can update/delete them
-- (CLAUDE.md: "never hard-delete... full audit history").
CREATE POLICY owner_insert_audit_log ON audit_log
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

-- Grants (CLAUDE.md/0006 lesson: RLS alone isn't sufficient, Postgres also
-- requires a table-level GRANT). Each line mirrors exactly the operations
-- the policies above allow.
GRANT INSERT, UPDATE ON properties TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE ON property_ownership TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE ON tenancies TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE ON tenancy_occupants TO authenticated;
--> statement-breakpoint
GRANT INSERT, UPDATE ON persons TO authenticated;
--> statement-breakpoint
GRANT INSERT ON audit_log TO authenticated;