
-- Phase 5: Storage scoping by tenant
-- Strategy: add a helper that validates the first folder of an object name
-- is either (a) a tenant the user belongs to, (b) the user is super_admin,
-- or (c) the path is "legacy" (first segment is not a UUID) — preserving
-- backward compatibility with existing objects.

CREATE OR REPLACE FUNCTION public.storage_path_allowed_for_user(object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Try to cast to uuid; if it isn't a uuid, treat as legacy path and allow
  BEGIN
    maybe_tenant := first_segment::uuid;
  EXCEPTION WHEN others THEN
    RETURN true; -- legacy non-tenant-prefixed path
  END;

  -- It IS a uuid: require active membership in that tenant
  RETURN EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = maybe_tenant
      AND tm.user_id = auth.uid()
      AND tm.is_active = true
  );
END;
$$;

-- Restrictive policies: enforce tenant prefix on the 9 app buckets for any
-- new writes/reads. Combined with existing permissive policies via AND.
DO $$
DECLARE
  b text;
  buckets text[] := ARRAY[
    'proposal-docs','booking-proofs','itineraries','supplier-docs',
    'ai-images','email-attachments','invoice-templates','invoice-docs',
    'whatsapp-media'
  ];
BEGIN
  FOREACH b IN ARRAY buckets LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "tenant_scope_%1$s_select" ON storage.objects;
      CREATE POLICY "tenant_scope_%1$s_select" ON storage.objects
        AS RESTRICTIVE FOR SELECT TO authenticated
        USING (bucket_id <> %2$L OR public.storage_path_allowed_for_user(name));

      DROP POLICY IF EXISTS "tenant_scope_%1$s_insert" ON storage.objects;
      CREATE POLICY "tenant_scope_%1$s_insert" ON storage.objects
        AS RESTRICTIVE FOR INSERT TO authenticated
        WITH CHECK (bucket_id <> %2$L OR public.storage_path_allowed_for_user(name));

      DROP POLICY IF EXISTS "tenant_scope_%1$s_update" ON storage.objects;
      CREATE POLICY "tenant_scope_%1$s_update" ON storage.objects
        AS RESTRICTIVE FOR UPDATE TO authenticated
        USING (bucket_id <> %2$L OR public.storage_path_allowed_for_user(name));

      DROP POLICY IF EXISTS "tenant_scope_%1$s_delete" ON storage.objects;
      CREATE POLICY "tenant_scope_%1$s_delete" ON storage.objects
        AS RESTRICTIVE FOR DELETE TO authenticated
        USING (bucket_id <> %2$L OR public.storage_path_allowed_for_user(name));
    $f$, b, b);
  END LOOP;
END $$;
