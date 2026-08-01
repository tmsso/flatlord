-- Tenants had no RLS read access to `properties` at all — only
-- owner_scope_properties (migration 0001) exists, and it's owner-only.
-- This is why "key rental data" (property address) was missing from the
-- tenant portal (ROADMAP Phase 1): the address genuinely wasn't
-- queryable by a tenant, RLS just silently nulled the nested embed
-- rather than erroring. Discovered via a real headless-Playwright
-- click-through as a tenant test account, not just noticed in review.
--
-- Scope: the tenant's whole property tree (root + every flat/room under
-- it), not just their exact unit — same granularity as
-- owner_scope_properties' whole-tree scoping, and necessary here too:
-- a room's address_line is null by design (inherited from its parent
-- flat/house, per properties.ts's own invariant), so a room-tenant needs
-- visibility into the ancestor chain to resolve their own address.
-- Reuses property_root_id() (migration 0012) to avoid the same
-- self-reference recursion bug fixed there — a raw subquery on
-- `properties` from within a policy on `properties` is invalid
-- regardless of whether the query is logically non-recursive.
CREATE POLICY tenant_scope_properties ON properties
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM tenancies t
      JOIN profiles pr ON pr.person_id = t.primary_tenant_id
      WHERE pr.id = auth.uid() AND pr.role = 'tenant'
        AND t.status = 'active'
        AND properties.root_property_id = property_root_id(t.unit_id)
    )
  );
