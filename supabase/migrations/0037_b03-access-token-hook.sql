-- B-03: custom access-token hook. Supabase Auth calls this when it issues
-- an access token and we add the caller's profiles.role as `user_role`,
-- so the proxy can route by role without querying profiles on every
-- request. Takes effect only once enabled per project in the dashboard
-- (Authentication → Hooks → Customize Access Token). Until then, and for
-- any token without the claim (no profile, or issued before the hook),
-- the proxy falls back to the profiles query (D-47).
--
-- Additive: a function, grants and one RLS policy; no table changes.
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  claims jsonb := event->'claims';
  user_role text;
BEGIN
  SELECT p.role::text INTO user_role FROM public.profiles p WHERE p.id = (event->>'user_id')::uuid;
  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
  END IF;
  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;
--> statement-breakpoint
-- Only Supabase Auth may run it; not callable over PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
--> statement-breakpoint
GRANT SELECT ON TABLE public.profiles TO supabase_auth_admin;
--> statement-breakpoint
-- profiles has RLS on; supabase_auth_admin doesn't bypass it.
CREATE POLICY "auth_admin_read_profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO supabase_auth_admin USING (true);
