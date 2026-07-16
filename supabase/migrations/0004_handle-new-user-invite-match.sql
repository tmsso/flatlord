-- Invite-only account creation: a new auth.users row (from Google OAuth
-- or a magic-link click) only gets a `profiles` row if a live invite
-- matches its email. No match -> the auth.users row exists but there's no
-- profile; app middleware treats "authenticated but no profiles row" as
-- "not invited" and signs the session out. No exception is raised here —
-- raising inside a trigger on Supabase's own auth.users table would risk
-- breaking GoTrue's internal signup flow in ways harder to recover from
-- than just leaving an orphaned auth.users row.
CREATE FUNCTION handle_new_user() RETURNS trigger AS $$
DECLARE
  v_invite invites;
BEGIN
  SELECT * INTO v_invite FROM invites
    WHERE lower(email) = lower(NEW.email)
      AND consumed_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    ORDER BY created_at DESC
    LIMIT 1;

  IF FOUND THEN
    INSERT INTO profiles (id, person_id, role, locale)
      VALUES (NEW.id, v_invite.person_id, v_invite.role, 'hu');
    UPDATE invites SET consumed_at = now() WHERE id = v_invite.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
--> statement-breakpoint

CREATE TRIGGER trg_handle_new_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
