
CREATE OR REPLACE FUNCTION public.list_user_audit_for_caller(_limit int DEFAULT 100)
RETURNS SETOF public.user_audit_log
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tid uuid;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF public.is_super_admin(v_uid) THEN
    RETURN QUERY
      SELECT * FROM public.user_audit_log
      ORDER BY created_at DESC
      LIMIT GREATEST(1, LEAST(_limit, 500));
    RETURN;
  END IF;

  SELECT count(*) INTO v_count
    FROM public.tenant_members
   WHERE user_id = v_uid AND is_active = true;

  IF v_count <> 1 THEN
    RETURN;
  END IF;

  SELECT tenant_id INTO v_tid
    FROM public.tenant_members
   WHERE user_id = v_uid AND is_active = true
   LIMIT 1;

  RETURN QUERY
    SELECT * FROM public.user_audit_log
    WHERE tenant_id = v_tid
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(_limit, 500));
END;
$$;

REVOKE ALL ON FUNCTION public.list_user_audit_for_caller(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_user_audit_for_caller(int) TO authenticated;
