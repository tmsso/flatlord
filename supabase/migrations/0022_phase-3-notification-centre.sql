-- Phase 3 item 4: in-app notification centre + per-user email preferences
-- (CLAUDE.md §3.11). The email fan-out itself already existed per-module
-- (notify-request-event.ts, notify-notice-issued.ts,
-- send-inventory-discrepancy-email.ts, notify-field-edit.ts) — this
-- migration adds the durable in-app record those functions now also
-- write to, plus the column letting each recipient opt out of the email
-- leg per category (in-app rows are always created regardless; only the
-- email send is gated by preference).
--
-- amount-due emails (send-amount-due-email.ts) are deliberately NOT wired
-- into this centre — that's an admin-triggered one-off action with its
-- own on-screen toast feedback already, not a background/automatic event
-- the other four are. Scope note, not an oversight.
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- profiles.id IS the auth.users id (see every existing self_*_profiles
  -- policy), so this can compare directly against auth.uid() below with
  -- no join needed.
  recipient_profile_id uuid NOT NULL REFERENCES profiles(id),
  category text NOT NULL,
  title text NOT NULL,
  body text,
  -- Deep-link target, populated only where a natural detail page exists
  -- today (request/notice) — null for inventory_discrepancy/field_edit in
  -- v1 (title/body text alone conveys those; no page to link to yet).
  entity_type text,
  entity_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint

CREATE POLICY self_scope_notifications ON notifications
  FOR SELECT USING (recipient_profile_id = auth.uid());
--> statement-breakpoint

-- Only read_at is ever meant to change from the client (marking read) —
-- there's no column-level GRANT restriction here (Postgres can't vary a
-- column-level GRANT by which columns the caller is retrying to touch in
-- a partial UPDATE the way this policy's WITH CHECK can restrict *rows*),
-- so mark-notification-read.ts is the only sanctioned caller and is
-- itself the real gate on which column gets written.
CREATE POLICY self_update_notifications ON notifications
  FOR UPDATE USING (recipient_profile_id = auth.uid())
  WITH CHECK (recipient_profile_id = auth.uid());
--> statement-breakpoint

-- No INSERT grant for `authenticated` at all: every row is system-
-- generated via create-notification.ts's service-role client, which
-- bypasses RLS/GRANTs entirely — there's no legitimate client-side insert
-- path for this table.
GRANT SELECT, UPDATE ON notifications TO authenticated;
--> statement-breakpoint

-- Per-user email preferences (CLAUDE.md §3.11): keyed by notification
-- category, e.g. {"request": {"email": false}}. Missing category = opted
-- in (see shouldEmailNotification's default-true). jsonb, not a table —
-- same "unstructured at the DB level, shape owned by the app layer" idiom
-- as tenancies.reminder_lead_days/meter_reading_config.
ALTER TABLE profiles ADD COLUMN notification_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint

-- A column-level GRANT UPDATE (notification_prefs) was tried first and
-- verified NOT to work on this platform: Supabase's permanent default ACL
-- already grants `authenticated` table-level UPDATE on every column of
-- profiles (confirmed by querying information_schema.column_privileges
-- against dev — see project memory flatlord_authenticated_role_grants,
-- "an absent GRANT doesn't deny either"; the same is true here of an
-- absent *column* GRANT, since the broader table-level one already
-- covers it). REVOKE would fight that same permanent ACL rather than
-- override it cleanly, so the real gate has to be RLS's WITH CHECK
-- instead: it compares `role`/`person_id` against their own
-- already-stored values via a self-referencing subquery (verified against
-- dev to see the pre-update row, not the in-flight one, under normal
-- Postgres statement-snapshot visibility), so a client can change
-- notification_prefs but not smuggle a role/person_id change into the
-- same UPDATE.
CREATE POLICY self_update_profiles ON profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM profiles p WHERE p.id = profiles.id)
    AND person_id IS NOT DISTINCT FROM (SELECT p.person_id FROM profiles p WHERE p.id = profiles.id)
  );
