-- Letting-mode invariant, tenancy-unit validation, and RLS.
--
-- Product rule (explicit, overrides the design mockup's own "let as a
-- whole (rooms can also be let individually)" copy): a flat with child
-- rooms is in exactly one of two mutually exclusive states —
--   `whole`   the flat itself is the lettable unit; every room is inactive
--   `by_room` the flat is not directly lettable; rooms are independent
-- A flat with no rooms is trivially its own lettable unit.
--
-- Postgres CHECK constraints can't see other rows, so the cross-row parts
-- of this are triggers. The exclusivity check is a DEFERRED constraint
-- trigger (fires at COMMIT) so a server action can flip letting_mode and
-- cascade-deactivate the now-invalid side's rooms in one transaction
-- without tripping mid-transaction.

--> statement-breakpoint

-- 1. Structural rule: a room must have a parent flat, even if that flat
-- isn't lettable — checked immediately, not deferred (a row's own parent
-- type never becomes valid mid-transaction by other statements).
CREATE FUNCTION properties_room_parent_is_flat() RETURNS trigger AS $$
BEGIN
  IF NEW.type = 'room' THEN
    IF NEW.parent_id IS NULL THEN
      RAISE EXCEPTION 'a room must have a parent flat';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM properties p WHERE p.id = NEW.parent_id AND p.type = 'flat'
    ) THEN
      RAISE EXCEPTION 'room %.parent_id must reference a flat, even if that flat is not lettable', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_properties_room_parent_is_flat
  BEFORE INSERT OR UPDATE OF parent_id, type ON properties
  FOR EACH ROW EXECUTE FUNCTION properties_room_parent_is_flat();
--> statement-breakpoint

-- 2. Canonical "is this unit lettable right now" — single source of truth
-- for the app, the tenancy-validity trigger below, and future UI. Houses
-- are never a direct tenancy target (the design's own tree shows no
-- lettable toggle on a house node).
CREATE FUNCTION property_is_lettable(p_id uuid) RETURNS boolean AS $$
  SELECT CASE p.type
    WHEN 'house' THEN false
    WHEN 'flat' THEN
      p.active AND (
        NOT EXISTS (SELECT 1 FROM properties r WHERE r.parent_id = p.id AND r.type = 'room')
        OR p.letting_mode = 'whole'
      )
    WHEN 'room' THEN
      p.active AND EXISTS (
        SELECT 1 FROM properties f
        WHERE f.id = p.parent_id AND f.type = 'flat' AND f.letting_mode = 'by_room'
      )
  END
  FROM properties p WHERE p.id = p_id;
$$ LANGUAGE sql STABLE;
--> statement-breakpoint

-- 3. The mutual-exclusivity invariant itself: rejects at COMMIT if a room
-- is active while its parent flat is `whole`, or if a flat switches to
-- `whole` while a child room is still active.
CREATE FUNCTION properties_check_letting_exclusivity() RETURNS trigger AS $$
DECLARE
  v_flat properties;
BEGIN
  IF NEW.type = 'room' THEN
    SELECT * INTO v_flat FROM properties WHERE id = NEW.parent_id;
    IF v_flat.letting_mode = 'whole' AND NEW.active THEN
      RAISE EXCEPTION 'room % cannot be active: parent flat % is in "whole" letting mode', NEW.id, v_flat.id;
    END IF;
  ELSIF NEW.type = 'flat' AND NEW.letting_mode = 'whole' THEN
    IF EXISTS (
      SELECT 1 FROM properties r WHERE r.parent_id = NEW.id AND r.type = 'room' AND r.active
    ) THEN
      RAISE EXCEPTION 'flat % cannot switch to "whole": one or more child rooms are still active', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER trg_properties_letting_exclusivity
  AFTER INSERT OR UPDATE OF active, letting_mode ON properties
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION properties_check_letting_exclusivity();
--> statement-breakpoint

-- 4. Reverse guard: a letting_mode/active change cannot strand a currently
-- active tenancy on a unit that would stop being lettable as a result.
CREATE FUNCTION properties_guard_active_tenancies() RETURNS trigger AS $$
BEGIN
  IF NEW.active IS DISTINCT FROM OLD.active
     OR NEW.letting_mode IS DISTINCT FROM OLD.letting_mode THEN
    IF EXISTS (
      SELECT 1 FROM tenancies t
      WHERE t.unit_id = NEW.id AND t.status = 'active' AND NOT property_is_lettable(NEW.id)
    ) THEN
      RAISE EXCEPTION 'cannot change letting_mode/active on property %: an active tenancy would be stranded', NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE CONSTRAINT TRIGGER trg_properties_guard_active_tenancies
  AFTER UPDATE OF active, letting_mode ON properties
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION properties_guard_active_tenancies();
--> statement-breakpoint

-- 5. Tenancy target validation: populates the denormalized unit_type /
-- property_id (used by RLS below), rejects house targets outright, and
-- rejects status='active' unless the unit is currently lettable.
CREATE FUNCTION tenancies_validate_unit() RETURNS trigger AS $$
DECLARE
  v_unit properties;
BEGIN
  SELECT * INTO v_unit FROM properties WHERE id = NEW.unit_id;
  IF v_unit.type = 'house' THEN
    RAISE EXCEPTION 'a tenancy cannot target a house directly, only a flat or room';
  END IF;
  NEW.unit_type := v_unit.type;
  NEW.property_id := v_unit.root_property_id;
  IF NEW.status = 'active' AND NOT property_is_lettable(NEW.unit_id) THEN
    RAISE EXCEPTION 'unit % is not currently lettable (check letting_mode/active on its flat)', NEW.unit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER trg_tenancies_validate_unit
  BEFORE INSERT OR UPDATE OF unit_id, status ON tenancies
  FOR EACH ROW EXECUTE FUNCTION tenancies_validate_unit();
--> statement-breakpoint

-- Row Level Security. CLAUDE.md §3.1: every domain table carries
-- property_id/tenancy_id; tenants scoped to their tenancy, admins to
-- properties they own. service_role (server-side only) bypasses RLS
-- entirely per Supabase's own semantics — no policy needed for it.

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE property_ownership ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenancy_occupants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE invites ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE field_policies ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

-- profiles: everyone can read their own row (needed for every other policy
-- below, which joins through profiles to resolve auth.uid() -> role/person).
CREATE POLICY self_select_profiles ON profiles
  FOR SELECT USING (id = auth.uid());
--> statement-breakpoint

-- properties: owners see the tree for properties they own (one join, not a
-- tree-walk, via the denormalized root_property_id).
CREATE POLICY owner_scope_properties ON properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = properties.root_property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY owner_scope_property_ownership ON property_ownership
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'owner' AND pr.person_id = property_ownership.person_id
    )
  );
--> statement-breakpoint

-- tenancies: owners scope by property_id (denormalized root_property_id),
-- tenants scope to their own tenancy only — this is the isolation the
-- Phase 0 RLS test asserts.
CREATE POLICY owner_scope_tenancies ON tenancies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM property_ownership po
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE po.property_id = tenancies.property_id
        AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_tenancies ON tenancies
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles pr
      WHERE pr.id = auth.uid() AND pr.role = 'tenant' AND pr.person_id = tenancies.primary_tenant_id
    )
  );
--> statement-breakpoint

CREATE POLICY owner_scope_tenancy_occupants ON tenancy_occupants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN property_ownership po ON po.property_id = t.property_id
      JOIN profiles pr ON pr.person_id = po.person_id
      WHERE t.id = tenancy_occupants.tenancy_id AND pr.id = auth.uid() AND pr.role = 'owner'
    )
  );
--> statement-breakpoint

CREATE POLICY tenant_scope_tenancy_occupants ON tenancy_occupants
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE t.id = tenancy_occupants.tenancy_id AND pr.id = auth.uid() AND pr.role = 'tenant'
    )
  );
--> statement-breakpoint

-- persons: owners see everyone (they manage the records); a person can see
-- their own record.
CREATE POLICY owner_scope_persons ON persons
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

CREATE POLICY self_scope_persons ON persons
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.person_id = persons.id)
  );
--> statement-breakpoint

-- invites, field_policies, audit_log: admin-only tables for Phase 0.
CREATE POLICY owner_scope_invites ON invites
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

CREATE POLICY owner_scope_field_policies ON field_policies
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
--> statement-breakpoint

CREATE POLICY owner_scope_audit_log ON audit_log
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner')
  );
