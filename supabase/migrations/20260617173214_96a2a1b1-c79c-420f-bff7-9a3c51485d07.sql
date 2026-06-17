
DROP POLICY IF EXISTS "Owners or admins read proposal-docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload proposal docs" ON storage.objects;
DROP POLICY IF EXISTS "Owners or admins can update proposal docs" ON storage.objects;
DROP POLICY IF EXISTS "Owners or admins can delete proposal docs" ON storage.objects;

CREATE POLICY "Tenant members read proposal-docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'proposal-docs'
  AND public.storage_path_allowed_for_user(name)
);

CREATE POLICY "Tenant members upload proposal-docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proposal-docs'
  AND public.storage_path_allowed_for_user(name)
);

CREATE POLICY "Tenant members update proposal-docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposal-docs'
  AND public.storage_path_allowed_for_user(name)
)
WITH CHECK (
  bucket_id = 'proposal-docs'
  AND public.storage_path_allowed_for_user(name)
);

CREATE POLICY "Uploader or admin delete proposal-docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'proposal-docs'
  AND public.storage_path_allowed_for_user(name)
  AND (
    (auth.uid())::text = (storage.foldername(name))[2]
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);
