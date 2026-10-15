-- B-47 — ownership bootstrap claim (long batch 2026-10-15).
--
-- owner_insert_property_ownership (0012, rewritten in 0032) let any owner
-- add the *first* ownership row of a property that had none — needed
-- because create-property.ts inserts the property, then its ownership row
-- as a second statement. Any unowned property (dev's orphan demo houses;
-- prod has none — owner pre-check unowned_roots = 0 on 2026-10-14) could
-- therefore be claimed by any owner who knew its id, rooms included.
--
-- Now the bootstrap branch only opens for the session that created the
-- property, and only on a root property. created_by is forced from
-- auth.uid() by a trigger, so a client can't set it; service-role inserts
-- (seeds, importer) leave it NULL and need no bootstrap (they bypass RLS).
-- App code is unchanged, so this applies cleanly before or after merge.
ALTER TABLE "properties" ADD COLUMN "created_by" uuid;--> statement-breakpoint

CREATE OR REPLACE FUNCTION private.set_property_created_by() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_by := auth.uid();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_properties_set_created_by
  BEFORE INSERT ON properties
  FOR EACH ROW EXECUTE FUNCTION private.set_property_created_by();
--> statement-breakpoint

-- created_by is never changed after insert (no owner path needs to).
CREATE OR REPLACE FUNCTION private.keep_property_created_by() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_by := OLD.created_by;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_properties_keep_created_by
  BEFORE UPDATE OF created_by ON properties
  FOR EACH ROW EXECUTE FUNCTION private.keep_property_created_by();
--> statement-breakpoint

-- May the caller add the first ownership row of this property? Only its
-- creator, only for a root property. SECURITY DEFINER: the caller can't
-- SELECT an unowned property under RLS (D-29 pattern).
CREATE OR REPLACE FUNCTION private.can_bootstrap_property_ownership(p_property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = p_property_id
      AND p.parent_id IS NULL
      AND p.created_by IS NOT NULL
      AND p.created_by = auth.uid()
  );
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION private.can_bootstrap_property_ownership(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION private.can_bootstrap_property_ownership(uuid) TO authenticated;--> statement-breakpoint

DROP POLICY owner_insert_property_ownership ON property_ownership;--> statement-breakpoint
CREATE POLICY owner_insert_property_ownership ON property_ownership
  FOR INSERT WITH CHECK (
    private.owner_person_id() IS NOT NULL
    AND (
      (
        NOT property_ownership_row_exists(property_ownership.property_id)
        AND private.can_bootstrap_property_ownership(property_ownership.property_id)
      )
      OR property_owned_by(property_ownership.property_id, auth.uid())
    )
    AND private.owner_can_see_person(property_ownership.person_id)
  );
