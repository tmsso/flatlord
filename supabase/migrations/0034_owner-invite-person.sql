-- Owner invites without a person (long batch 2026-10-12, found verifying
-- B-45). The invite form doesn't ask for a person, and handle_new_user
-- (0004) copies the invite's person_id — NULL for such an invite — into
-- the new profile. getCurrentProfile/requireOwnerPersonId then throw
-- "Caller has no person record", so a newly invited owner hit a 500 on
-- every page: a second owner could not use the app at all.
--
-- Now an *owner* invite without a person creates a bare person record for
-- the invitee (given_name = the email's local part, family_name empty —
-- they rename themselves on their person page). managed_by_person_id stays
-- NULL (no session at signup), so only the new owner sees it (0032's
-- "self" rule) — the inviting owner does not. Tenant invites are
-- unchanged: a tenant must be bound to their tenant record by the owner.
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger AS $$
DECLARE
  v_invite invites;
  v_person_id uuid;
BEGIN
  SELECT * INTO v_invite FROM invites
    WHERE lower(email) = lower(NEW.email)
      AND consumed_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

  IF FOUND THEN
    v_person_id := v_invite.person_id;
    IF v_person_id IS NULL AND v_invite.role = 'owner' THEN
      INSERT INTO persons (given_name, family_name)
        VALUES (split_part(NEW.email, '@', 1), '')
        RETURNING id INTO v_person_id;
    END IF;
    INSERT INTO profiles (id, person_id, role, locale)
      VALUES (NEW.id, v_person_id, v_invite.role, 'hu');
    UPDATE invites SET consumed_at = now() WHERE id = v_invite.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
