
-- 1) Restrict license_codes SELECT to super admins only
DROP POLICY IF EXISTS "license_codes_select_active" ON public.license_codes;

CREATE POLICY "license_codes_select_super_admin"
  ON public.license_codes
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 2) Tighten storage_path_allowed_for_user to require tenant UUID prefix
CREATE OR REPLACE FUNCTION public.storage_path_allowed_for_user(object_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  first_segment text;
  maybe_tenant uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_super_admin(auth.uid()) THEN
    RETURN true;
  END IF;

  first_segment := split_part(coalesce(object_name, ''), '/', 1);
  IF first_segment = '' THEN
    RETURN false;
  END IF;

  -- Strict: first segment MUST be a valid tenant UUID. Legacy non-UUID
  -- paths are denied to prevent tenant-isolation bypass.
  BEGIN
    maybe_tenant := first_segment::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;

  RETURN EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = maybe_tenant
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
  );
END;
$function$;
