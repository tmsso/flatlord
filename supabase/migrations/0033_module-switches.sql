-- B-45 / D-33 switchable modules (owner request 2026-10-12). Optional
-- modules are switched per owner; billing, meters, contracts and tenancy
-- are core and have no switch. Raw SQL like 0022's notification_prefs
-- (profiles' app-managed settings live outside the drizzle schema).
--
-- New owners start with everything optional switched off (the column
-- default); existing owners are backfilled with what they use today, so
-- prod sees no change. 'taxation' is accepted but the module isn't built
-- yet (B-44).
ALTER TABLE profiles ADD COLUMN enabled_modules text[] NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE profiles ADD CONSTRAINT profiles_enabled_modules_known
  CHECK (enabled_modules <@ ARRAY['inventory', 'requests', 'notifications', 'taxation']::text[]);
--> statement-breakpoint
UPDATE profiles SET enabled_modules = ARRAY['inventory', 'requests', 'notifications']::text[] WHERE role = 'owner';
--> statement-breakpoint

-- Owners toggle their own switches. Row scope + the pinned role/person_id
-- come from self_update_profiles (0022).
GRANT UPDATE (enabled_modules) ON profiles TO authenticated;
--> statement-breakpoint

-- What a property's tenants and crons follow: a module is on for a
-- property if ANY of its owners has it on (co-owners, add-property-owner).
-- Callable over RPC by its own owners and tenants only — anyone else gets
-- an empty array, so it can't be used to probe other properties.
CREATE OR REPLACE FUNCTION public.property_enabled_modules(p_property_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN property_owned_by(p_property_id, auth.uid()) OR private.tenant_of_property(p_property_id) THEN
      coalesce((
        SELECT array_agg(DISTINCT m ORDER BY m)
        FROM property_ownership po
        JOIN profiles pr ON pr.person_id = po.person_id AND pr.role = 'owner'
        CROSS JOIN LATERAL unnest(pr.enabled_modules) AS m
        WHERE po.property_id = p_property_id
      ), '{}'::text[])
    ELSE '{}'::text[]
  END;
$$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION public.property_enabled_modules(uuid) FROM PUBLIC, anon;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.property_enabled_modules(uuid) TO authenticated;
