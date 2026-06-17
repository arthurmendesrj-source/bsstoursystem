
CREATE OR REPLACE FUNCTION public.check_realtime_security()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_is_admin boolean;
  v_published jsonb;
  v_policies jsonb;
  v_rls_enabled boolean := false;
  v_policy_count int := 0;
  v_status text;
  v_messages_exists boolean;
BEGIN
  -- Authorize: admin only
  SELECT public.is_admin(auth.uid()) INTO v_is_admin;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Tables in the supabase_realtime publication (schema.table)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename) ORDER BY schemaname, tablename), '[]'::jsonb)
    INTO v_published
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime';

  -- Does realtime.messages exist?
  SELECT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages'
  ) INTO v_messages_exists;

  IF v_messages_exists THEN
    SELECT c.relrowsecurity
      INTO v_rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'realtime' AND c.relname = 'messages';

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'name', polname,
             'cmd', polcmd::text,
             'using', pg_get_expr(polqual, polrelid),
             'with_check', pg_get_expr(polwithcheck, polrelid)
           ) ORDER BY polname), '[]'::jsonb),
           count(*)
      INTO v_policies, v_policy_count
      FROM pg_policy
     WHERE polrelid = 'realtime.messages'::regclass;
  ELSE
    v_policies := '[]'::jsonb;
  END IF;

  -- Status:
  --  ok    = RLS enabled AND at least one policy
  --  warn  = no published tables (nothing exposed) OR rls enabled w/ no policy
  --  error = published tables exist but realtime.messages has no RLS / no policy
  IF jsonb_array_length(v_published) = 0 THEN
    v_status := 'ok';
  ELSIF v_rls_enabled AND v_policy_count > 0 THEN
    v_status := 'ok';
  ELSIF v_rls_enabled AND v_policy_count = 0 THEN
    v_status := 'error';
  ELSE
    v_status := 'error';
  END IF;

  RETURN jsonb_build_object(
    'status', v_status,
    'realtime_messages_exists', v_messages_exists,
    'realtime_messages_rls_enabled', v_rls_enabled,
    'realtime_messages_policy_count', v_policy_count,
    'realtime_messages_policies', v_policies,
    'published_tables', v_published,
    'checked_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_realtime_security() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_realtime_security() TO authenticated, service_role;
