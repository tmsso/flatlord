ALTER TABLE "persons" ADD COLUMN "managed_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "field_policies" ADD COLUMN "property_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "property_id" uuid;--> statement-breakpoint
ALTER TABLE "persons" ADD CONSTRAINT "persons_managed_by_person_id_persons_id_fk" FOREIGN KEY ("managed_by_person_id") REFERENCES "public"."persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_policies" ADD CONSTRAINT "field_policies_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "persons_managed_by_person_id_idx" ON "persons" USING btree ("managed_by_person_id");--> statement-breakpoint
CREATE INDEX "field_policies_property_id_idx" ON "field_policies" USING btree ("property_id");--> statement-breakpoint
CREATE INDEX "audit_log_property_id_idx" ON "audit_log" USING btree ("property_id");--> statement-breakpoint

-- =====================================================================
-- Owner-to-owner isolation (long batch 2026-10-12, A1).
--
-- Until now every owner-scoped policy on persons, invites, audit_log,
-- field_policies and person attachments only asked "is the caller an
-- owner?", not "an owner of what?". Harmless with one owner (prod has
-- exactly one, verified 2026-10-12), but a second owner — the stated next
-- step (family/friends, CLAUDE.md §1) — could have read and edited every
-- person's identity data, opened their ID scans and read the whole audit
-- log. And `owner_update_property_ownership` had no WITH CHECK, so an
-- owner could repoint their own ownership row at someone else's flat.
--
-- Shape of the fix:
--   * persons get `managed_by_person_id` (the owner who created them, set
--     by trigger); an owner sees a person if it is themselves, they manage
--     it, or it is linked (tenant / occupant / co-owner) to a property
--     they own.
--   * every write that *links* a person (tenancy, occupant, ownership,
--     invite) requires that person to already be visible to the caller —
--     otherwise linking a foreign person id would itself grant visibility.
--   * audit_log gets `property_id`, derived by trigger from the audited
--     entity, so no logAudit() call site changes.
--   * field_policies become per root property (decision 2026-10-12);
--     property-less rows remain read-only built-in defaults.
--
-- Stored-row lookups live in SECURITY DEFINER functions in `private`
-- (D-29: a policy must not subquery its own table; `private` is not
-- exposed by PostgREST, so these can't be called over RPC as oracles).
-- Where a policy can decide from the row itself (managed_by, self) it
-- does so inline — a function lookup can't see a row that the same
-- INSERT ... RETURNING statement is creating.
-- =====================================================================

-- The caller's own person id if they are an owner, else NULL.
CREATE OR REPLACE FUNCTION private.owner_person_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pr.person_id FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = 'owner';
$$;
--> statement-breakpoint

-- Is this person linked to a property the calling owner owns — as primary
-- tenant, co-occupant or (co-)owner? Ended tenancies still count: an
-- owner keeps seeing their former tenants.
CREATE OR REPLACE FUNCTION private.owner_linked_person(p_person_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenancies t
    WHERE t.primary_tenant_id = p_person_id AND property_owned_by(t.property_id, auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM tenancy_occupants o JOIN tenancies t ON t.id = o.tenancy_id
    WHERE o.person_id = p_person_id AND property_owned_by(t.property_id, auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM property_ownership po
    WHERE po.person_id = p_person_id AND property_owned_by(po.property_id, auth.uid())
  );
$$;
--> statement-breakpoint

-- Full visibility test by id, for policies on *other* tables that
-- reference a person (links, invites, attachments, audit rows).
CREATE OR REPLACE FUNCTION private.owner_can_see_person(p_person_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT private.owner_person_id() IS NOT NULL AND (
    p_person_id = private.owner_person_id()
    OR EXISTS (SELECT 1 FROM persons x WHERE x.id = p_person_id AND x.managed_by_person_id = private.owner_person_id())
    OR private.owner_linked_person(p_person_id)
  );
$$;
--> statement-breakpoint

-- Is the caller a tenant (primary or co-occupant) on this root property?
CREATE OR REPLACE FUNCTION private.tenant_of_property(p_property_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles pr
    JOIN tenancies t ON t.property_id = p_property_id
    WHERE pr.id = auth.uid() AND pr.role = 'tenant'
      AND (t.primary_tenant_id = pr.person_id
           OR EXISTS (SELECT 1 FROM tenancy_occupants o WHERE o.tenancy_id = t.id AND o.person_id = pr.person_id))
  );
$$;
--> statement-breakpoint

-- ---------------------------------------------------------------- persons
CREATE OR REPLACE FUNCTION persons_set_managed_by() RETURNS trigger AS $$
BEGIN
  IF NEW.managed_by_person_id IS NULL THEN
    NEW.managed_by_person_id := private.owner_person_id();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
--> statement-breakpoint
CREATE TRIGGER trg_persons_set_managed_by
  BEFORE INSERT ON persons
  FOR EACH ROW EXECUTE FUNCTION persons_set_managed_by();
--> statement-breakpoint

-- Backfill 1: tenants and co-occupants → an owner of their tenancy's
-- property (lowest person id when a property has several owners, purely
-- for determinism; co-owners see the person through the link anyway).
UPDATE persons p SET managed_by_person_id = sub.owner_person_id
FROM (
  SELECT DISTINCT ON (x.person_id) x.person_id, po.person_id AS owner_person_id
  FROM (
    SELECT t.primary_tenant_id AS person_id, t.property_id FROM tenancies t
    UNION
    SELECT o.person_id, t.property_id FROM tenancy_occupants o JOIN tenancies t ON t.id = o.tenancy_id
  ) x
  JOIN property_ownership po ON po.property_id = x.property_id
  JOIN profiles pr ON pr.person_id = po.person_id AND pr.role = 'owner'
  ORDER BY x.person_id, po.person_id
) sub
WHERE p.id = sub.person_id AND p.managed_by_person_id IS NULL;
--> statement-breakpoint

-- Backfill 2: persons with no link (created but never attached) that are
-- not owners themselves → the owner holding the most properties. On prod
-- that is the only owner; on dev it is the demo owner.
UPDATE persons p SET managed_by_person_id = (
  SELECT pr.person_id FROM profiles pr
  WHERE pr.role = 'owner' AND pr.person_id IS NOT NULL
  ORDER BY (SELECT count(*) FROM property_ownership po WHERE po.person_id = pr.person_id) DESC, pr.created_at
  LIMIT 1
)
WHERE p.managed_by_person_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM profiles pr WHERE pr.person_id = p.id AND pr.role = 'owner')
  AND NOT EXISTS (SELECT 1 FROM property_ownership po WHERE po.person_id = p.id);
--> statement-breakpoint

DROP POLICY owner_scope_persons ON persons;--> statement-breakpoint
DROP POLICY owner_insert_persons ON persons;--> statement-breakpoint
DROP POLICY owner_update_persons ON persons;--> statement-breakpoint

CREATE POLICY owner_scope_persons ON persons
  FOR SELECT USING (
    persons.id = private.owner_person_id()
    OR persons.managed_by_person_id = private.owner_person_id()
    OR private.owner_linked_person(persons.id)
  );
--> statement-breakpoint

-- The trigger fills managed_by from the session; the check pins it so an
-- owner can't create a record "managed by" someone else.
CREATE POLICY owner_insert_persons ON persons
  FOR INSERT WITH CHECK (
    private.owner_person_id() IS NOT NULL
    AND persons.managed_by_person_id = private.owner_person_id()
  );
--> statement-breakpoint

CREATE POLICY owner_update_persons ON persons
  FOR UPDATE USING (
    persons.id = private.owner_person_id()
    OR persons.managed_by_person_id = private.owner_person_id()
    OR private.owner_linked_person(persons.id)
  )
  WITH CHECK (
    persons.id = private.owner_person_id()
    OR persons.managed_by_person_id = private.owner_person_id()
    OR private.owner_linked_person(persons.id)
  );
--> statement-breakpoint

-- ----------------------------------------------------- property_ownership
-- Was USING-only: the implicit WITH CHECK only re-tested "this row is
-- mine (person_id)", so property_id could be rewritten to any property.
DROP POLICY owner_update_property_ownership ON property_ownership;--> statement-breakpoint
CREATE POLICY owner_update_property_ownership ON property_ownership
  FOR UPDATE USING (property_ownership.person_id = private.owner_person_id())
  WITH CHECK (
    property_ownership.person_id = private.owner_person_id()
    AND property_owned_by(property_ownership.property_id, auth.uid())
  );
--> statement-breakpoint

DROP POLICY owner_insert_property_ownership ON property_ownership;--> statement-breakpoint
CREATE POLICY owner_insert_property_ownership ON property_ownership
  FOR INSERT WITH CHECK (
    private.owner_person_id() IS NOT NULL
    AND (
      NOT property_ownership_row_exists(property_ownership.property_id)
      OR property_owned_by(property_ownership.property_id, auth.uid())
    )
    AND private.owner_can_see_person(property_ownership.person_id)
  );
--> statement-breakpoint

-- ------------------------------------------- tenancies / tenancy_occupants
-- Same property checks as before, plus: the linked person must already be
-- visible to the caller.
DROP POLICY owner_insert_tenancies ON tenancies;--> statement-breakpoint
CREATE POLICY owner_insert_tenancies ON tenancies
  FOR INSERT WITH CHECK (
    property_owned_by(tenancies.property_id, auth.uid())
    AND private.owner_can_see_person(tenancies.primary_tenant_id)
  );
--> statement-breakpoint

DROP POLICY owner_update_tenancies ON tenancies;--> statement-breakpoint
CREATE POLICY owner_update_tenancies ON tenancies
  FOR UPDATE USING (property_owned_by(tenancies.property_id, auth.uid()))
  WITH CHECK (
    property_owned_by(tenancies.property_id, auth.uid())
    AND private.owner_can_see_person(tenancies.primary_tenant_id)
  );
--> statement-breakpoint

DROP POLICY owner_insert_tenancy_occupants ON tenancy_occupants;--> statement-breakpoint
CREATE POLICY owner_insert_tenancy_occupants ON tenancy_occupants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      WHERE t.id = tenancy_occupants.tenancy_id AND property_owned_by(t.property_id, auth.uid())
    )
    AND private.owner_can_see_person(tenancy_occupants.person_id)
  );
--> statement-breakpoint

DROP POLICY owner_update_tenancy_occupants ON tenancy_occupants;--> statement-breakpoint
CREATE POLICY owner_update_tenancy_occupants ON tenancy_occupants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      WHERE t.id = tenancy_occupants.tenancy_id AND property_owned_by(t.property_id, auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tenancies t
      WHERE t.id = tenancy_occupants.tenancy_id AND property_owned_by(t.property_id, auth.uid())
    )
    AND private.owner_can_see_person(tenancy_occupants.person_id)
  );
--> statement-breakpoint

-- ---------------------------------------------------------------- invites
-- An owner sees invites they sent, and invites for persons they can see
-- (covers the seed-created owner invite, whose invited_by is NULL).
-- Inserting pins invited_by to the caller, and an invite may only be
-- bound to a visible person — otherwise whoever redeems it would get a
-- profile on someone else's person record.
DROP POLICY owner_scope_invites ON invites;--> statement-breakpoint
DROP POLICY owner_insert_invites ON invites;--> statement-breakpoint
DROP POLICY owner_update_invites ON invites;--> statement-breakpoint

CREATE POLICY owner_scope_invites ON invites
  FOR SELECT USING (
    private.owner_person_id() IS NOT NULL
    AND (
      invites.invited_by = private.owner_person_id()
      OR (invites.person_id IS NOT NULL AND private.owner_can_see_person(invites.person_id))
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_invites ON invites
  FOR INSERT WITH CHECK (
    private.owner_person_id() IS NOT NULL
    AND invites.invited_by = private.owner_person_id()
    AND (invites.person_id IS NULL OR private.owner_can_see_person(invites.person_id))
  );
--> statement-breakpoint

CREATE POLICY owner_update_invites ON invites
  FOR UPDATE USING (
    private.owner_person_id() IS NOT NULL
    AND (
      invites.invited_by = private.owner_person_id()
      OR (invites.person_id IS NOT NULL AND private.owner_can_see_person(invites.person_id))
    )
  )
  WITH CHECK (
    private.owner_person_id() IS NOT NULL
    AND (
      invites.invited_by = private.owner_person_id()
      OR (invites.person_id IS NOT NULL AND private.owner_can_see_person(invites.person_id))
    )
    AND (invites.person_id IS NULL OR private.owner_can_see_person(invites.person_id))
  );
--> statement-breakpoint

-- -------------------------------------------- attachments (person branch)
-- The 'person' branch of the generic attachments policies, and of the
-- storage policies on the `attachments` bucket (folder person/<id>/…, ID
-- scans), only checked "caller is an owner". The other branches are
-- already property-scoped and are recreated unchanged.
DROP POLICY owner_scope_attachments ON attachments;--> statement-breakpoint
DROP POLICY owner_insert_attachments ON attachments;--> statement-breakpoint
DROP POLICY owner_update_attachments ON attachments;--> statement-breakpoint

CREATE POLICY owner_scope_attachments ON attachments
  FOR SELECT USING (
    (attachments.entity_type = 'person' AND private.owner_can_see_person(attachments.entity_id))
    OR (
      attachments.entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        WHERE t.id = attachments.entity_id AND property_owned_by(t.property_id, auth.uid())
      )
    )
  );
--> statement-breakpoint

CREATE POLICY owner_insert_attachments ON attachments
  FOR INSERT WITH CHECK (
    (attachments.entity_type = 'person' AND private.owner_can_see_person(attachments.entity_id))
    OR (
      attachments.entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        WHERE t.id = attachments.entity_id AND property_owned_by(t.property_id, auth.uid())
      )
    )
  );
--> statement-breakpoint

CREATE POLICY owner_update_attachments ON attachments
  FOR UPDATE USING (
    (attachments.entity_type = 'person' AND private.owner_can_see_person(attachments.entity_id))
    OR (
      attachments.entity_type = 'tenancy'
      AND EXISTS (
        SELECT 1 FROM tenancies t
        WHERE t.id = attachments.entity_id AND property_owned_by(t.property_id, auth.uid())
      )
    )
  );
--> statement-breakpoint

DROP POLICY owner_insert_attachment_objects ON storage.objects;--> statement-breakpoint
DROP POLICY owner_select_attachment_objects ON storage.objects;--> statement-breakpoint

CREATE POLICY owner_insert_attachment_objects ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'attachments'
    AND (
      (
        (storage.foldername(name))[1] = 'person'
        AND private.owner_can_see_person(((storage.foldername(name))[2])::uuid)
      )
      OR (
        (storage.foldername(name))[1] = 'tenancy'
        AND EXISTS (
          SELECT 1 FROM tenancies t
          WHERE t.id = ((storage.foldername(name))[2])::uuid AND property_owned_by(t.property_id, auth.uid())
        )
      )
    )
  );
--> statement-breakpoint

CREATE POLICY owner_select_attachment_objects ON storage.objects
  FOR SELECT USING (
    bucket_id = 'attachments'
    AND (
      (
        (storage.foldername(name))[1] = 'person'
        AND private.owner_can_see_person(((storage.foldername(name))[2])::uuid)
      )
      OR (
        (storage.foldername(name))[1] = 'tenancy'
        AND EXISTS (
          SELECT 1 FROM tenancies t
          WHERE t.id = ((storage.foldername(name))[2])::uuid AND property_owned_by(t.property_id, auth.uid())
        )
      )
    )
  );
--> statement-breakpoint

-- -------------------------------------------------------------- audit_log
-- Root property of an audited entity, by the entity types logAudit() is
-- called with today. Unknown types and persons → NULL (person rows are
-- scoped through person visibility instead). `property_ownership` rows
-- are logged under the property's id, not the ownership row's.
CREATE OR REPLACE FUNCTION private.audit_property_id(p_entity_type text, p_entity_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_entity_type
    WHEN 'property' THEN (SELECT root_property_id FROM properties WHERE id = p_entity_id)
    WHEN 'property_ownership' THEN (SELECT root_property_id FROM properties WHERE id = p_entity_id)
    WHEN 'tenancy' THEN (SELECT property_id FROM tenancies WHERE id = p_entity_id)
    WHEN 'tenancy_occupant' THEN (
      SELECT t.property_id FROM tenancy_occupants o JOIN tenancies t ON t.id = o.tenancy_id WHERE o.id = p_entity_id)
    WHEN 'attachment' THEN (SELECT property_id FROM attachments WHERE id = p_entity_id)
    WHEN 'contract' THEN (SELECT property_id FROM contracts WHERE id = p_entity_id)
    WHEN 'deposit_transaction' THEN (SELECT property_id FROM deposit_transactions WHERE id = p_entity_id)
    WHEN 'inventory_item' THEN (SELECT property_id FROM inventory_items WHERE id = p_entity_id)
    WHEN 'inventory_reconfirmation' THEN (SELECT property_id FROM inventory_reconfirmations WHERE id = p_entity_id)
    WHEN 'inventory_reconfirmation_item' THEN (
      SELECT r.property_id FROM inventory_reconfirmation_items i
      JOIN inventory_reconfirmations r ON r.id = i.reconfirmation_id WHERE i.id = p_entity_id)
    WHEN 'notice' THEN (SELECT property_id FROM notices WHERE id = p_entity_id)
    WHEN 'request' THEN (SELECT property_id FROM requests WHERE id = p_entity_id)
    WHEN 'request_message' THEN (
      SELECT r.property_id FROM request_messages m JOIN requests r ON r.id = m.request_id WHERE m.id = p_entity_id)
    WHEN 'statement' THEN (SELECT property_id FROM statements WHERE id = p_entity_id)
    WHEN 'field_policy' THEN (SELECT property_id FROM field_policies WHERE id = p_entity_id)
    ELSE NULL
  END;
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION audit_log_set_property_id() RETURNS trigger AS $$
BEGIN
  IF NEW.property_id IS NULL THEN
    NEW.property_id := private.audit_property_id(NEW.entity_type, NEW.entity_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
--> statement-breakpoint
CREATE TRIGGER trg_audit_log_set_property_id
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_set_property_id();
--> statement-breakpoint

UPDATE audit_log SET property_id = private.audit_property_id(entity_type, entity_id) WHERE property_id IS NULL;
--> statement-breakpoint

DROP POLICY owner_scope_audit_log ON audit_log;--> statement-breakpoint
DROP POLICY owner_insert_audit_log ON audit_log;--> statement-breakpoint

-- Visible: rows about the caller's properties, about persons the caller
-- can see, and the caller's own actions. Tenant-actor rows about the
-- owner's property (requests, self-edits) stay visible to that owner.
CREATE POLICY owner_scope_audit_log ON audit_log
  FOR SELECT USING (
    private.owner_person_id() IS NOT NULL
    AND (
      (audit_log.property_id IS NOT NULL AND property_owned_by(audit_log.property_id, auth.uid()))
      OR (audit_log.entity_type = 'person' AND private.owner_can_see_person(audit_log.entity_id))
      OR audit_log.actor_id = private.owner_person_id()
    )
  );
--> statement-breakpoint

-- An owner may only record themselves as actor, and only about their own
-- properties / visible persons — no forged history on someone else's flat.
CREATE POLICY owner_insert_audit_log ON audit_log
  FOR INSERT WITH CHECK (
    private.owner_person_id() IS NOT NULL
    AND audit_log.actor_id = private.owner_person_id()
    AND (audit_log.property_id IS NULL OR property_owned_by(audit_log.property_id, auth.uid()))
    AND (audit_log.entity_type <> 'person' OR private.owner_can_see_person(audit_log.entity_id))
  );
--> statement-breakpoint

-- --------------------------------------------------------- field_policies
-- Copy today's global rows to every owned root property, so each existing
-- owner keeps exactly the behaviour they configured; the global rows stay
-- as read-only defaults for properties created later.
INSERT INTO field_policies (entity_type, field_name, policy, property_id)
SELECT fp.entity_type, fp.field_name, fp.policy, p.id
FROM field_policies fp
CROSS JOIN properties p
WHERE fp.property_id IS NULL AND fp.scope IS NULL
  AND p.parent_id IS NULL
  AND EXISTS (SELECT 1 FROM property_ownership po WHERE po.property_id = p.id);
--> statement-breakpoint

CREATE UNIQUE INDEX field_policies_property_field_uq
  ON field_policies (property_id, entity_type, field_name)
  WHERE property_id IS NOT NULL AND scope IS NULL;
--> statement-breakpoint

DROP POLICY authenticated_read_field_policies ON field_policies;--> statement-breakpoint
DROP POLICY owner_scope_field_policies ON field_policies;--> statement-breakpoint
DROP POLICY owner_insert_field_policies ON field_policies;--> statement-breakpoint
DROP POLICY owner_update_field_policies ON field_policies;--> statement-breakpoint
DROP POLICY owner_delete_field_policies ON field_policies;--> statement-breakpoint

CREATE POLICY read_field_policies ON field_policies
  FOR SELECT USING (
    field_policies.property_id IS NULL
    OR property_owned_by(field_policies.property_id, auth.uid())
    OR private.tenant_of_property(field_policies.property_id)
  );
--> statement-breakpoint

CREATE POLICY owner_insert_field_policies ON field_policies
  FOR INSERT WITH CHECK (
    field_policies.property_id IS NOT NULL AND property_owned_by(field_policies.property_id, auth.uid())
  );
--> statement-breakpoint

CREATE POLICY owner_update_field_policies ON field_policies
  FOR UPDATE USING (
    field_policies.property_id IS NOT NULL AND property_owned_by(field_policies.property_id, auth.uid())
  )
  WITH CHECK (
    field_policies.property_id IS NOT NULL AND property_owned_by(field_policies.property_id, auth.uid())
  );
--> statement-breakpoint

CREATE POLICY owner_delete_field_policies ON field_policies
  FOR DELETE USING (
    field_policies.property_id IS NOT NULL AND property_owned_by(field_policies.property_id, auth.uid())
  );
