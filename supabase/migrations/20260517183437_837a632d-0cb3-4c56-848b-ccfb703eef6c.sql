
-- Itineraries bucket: restrict SELECT to admin or staff (operacional)
DROP POLICY IF EXISTS "Authenticated read itineraries bucket" ON storage.objects;
CREATE POLICY "Staff read itineraries bucket" ON storage.objects FOR SELECT
USING (
  bucket_id = 'itineraries'
  AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role))
);

-- Supplier-docs bucket: restrict SELECT to users with supplier_documents view permission
DROP POLICY IF EXISTS "Authenticated read supplier-docs" ON storage.objects;
CREATE POLICY "Permitted read supplier-docs" ON storage.objects FOR SELECT
USING (
  bucket_id = 'supplier-docs'
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'supplier_documents', 'view'))
);

-- whatsapp-media: add UPDATE and DELETE policies scoped to account owner
CREATE POLICY "wa_media_update" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'whatsapp-media'
  AND (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM whatsapp_accounts a
    WHERE a.user_id = auth.uid()
      AND (storage.foldername(objects.name))[1] = a.id::text
  ))
);

CREATE POLICY "wa_media_delete" ON storage.objects FOR DELETE
USING (
  bucket_id = 'whatsapp-media'
  AND (is_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM whatsapp_accounts a
    WHERE a.user_id = auth.uid()
      AND (storage.foldername(objects.name))[1] = a.id::text
  ))
);

-- proposal-docs: add UPDATE policy scoped to folder owner or admin
CREATE POLICY "Owners or admins can update proposal docs" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'proposal-docs'
  AND ((auth.uid())::text = (storage.foldername(name))[1] OR has_role(auth.uid(), 'admin'::app_role))
);
