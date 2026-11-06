-- B-49: "before user created" Auth hook. Supabase Auth calls this before it
-- inserts an auth.users row (magic-link sign-up, Google sign-in, admin
-- createUser). Without a live invite for the email, sign-up is refused, so
-- an uninvited Google account never leaves an orphan auth.users row (the
-- proxy used to sign it out afterwards). Same matching rule as
-- handle_new_user (0034): case-insensitive email, not consumed, not
-- revoked, not expired.
--
-- Takes effect only once enabled per project in the dashboard
-- (Authentication → Hooks → Before User Created). Until then nothing
-- changes. Additive: a function, grants and one RLS policy.
CREATE OR REPLACE FUNCTION public.before_user_created_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_email text := event->'user'->>'email';
BEGIN
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.invites i
    WHERE lower(i.email) = lower(v_email)
      AND i.consumed_at IS NULL
      AND i.revoked_at IS NULL
      AND i.expires_at > now()
  ) THEN
    RETURN '{}'::jsonb;
  END IF;
  RETURN jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'Sign-up requires an invitation.')
  );
END;
$$;
--> statement-breakpoint
-- Only Supabase Auth may run it; not callable over PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.before_user_created_hook(jsonb) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.before_user_created_hook(jsonb) TO supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON TABLE public.invites TO supabase_auth_admin;
--> statement-breakpoint
-- invites has RLS on; supabase_auth_admin doesn't bypass it.
CREATE POLICY "auth_admin_read_invites" ON public.invites AS PERMISSIVE FOR SELECT TO supabase_auth_admin USING (true);
