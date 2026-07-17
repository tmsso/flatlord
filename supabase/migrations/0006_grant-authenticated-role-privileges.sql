-- RLS policies (0001, 0005) restrict *rows*, but Postgres also requires a
-- table-level GRANT before a role can touch a table at all — RLS alone
-- isn't sufficient. This repo's migrations never added those grants; it
-- worked against the existing cloud dev project only because that project
-- predates Supabase's stricter "don't auto-expose new tables" default
-- (see supabase/config.toml's auto_expose_new_tables comment, and its
-- 2026-10-30 removal date) and still carries the legacy auto-grant. A
-- fresh project — `supabase start` in CI, or any future new project —
-- gets the strict default and fails with "permission denied for table ..."
-- on every authenticated-role query. Discovered via the first real CI run
-- against a from-scratch local stack (tests/unit/rls-tenancy-isolation.test.ts).
--
-- Grants mirror exactly the operations each table's RLS policies allow
-- (0001_letting-mode-invariant-and-rls.sql, 0005_invites-owner-write-policies.sql)
-- — SELECT-only everywhere except invites, which also has owner insert/update.
GRANT SELECT ON profiles TO authenticated;
--> statement-breakpoint
GRANT SELECT ON properties TO authenticated;
--> statement-breakpoint
GRANT SELECT ON property_ownership TO authenticated;
--> statement-breakpoint
GRANT SELECT ON tenancies TO authenticated;
--> statement-breakpoint
GRANT SELECT ON tenancy_occupants TO authenticated;
--> statement-breakpoint
GRANT SELECT ON persons TO authenticated;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON invites TO authenticated;
--> statement-breakpoint
GRANT SELECT ON field_policies TO authenticated;
--> statement-breakpoint
GRANT SELECT ON audit_log TO authenticated;
