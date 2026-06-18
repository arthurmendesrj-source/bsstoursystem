-- Defense-in-depth: add tenant-path check to permissive storage policies.

-- booking-proofs
DROP POLICY IF EXISTS "Bookings access read booking-proofs" ON storage.objects;
CREATE POLICY "Bookings access read booking-proofs" ON storage.objects FOR SELECT
USING (
  bucket_id = 'booking-proofs'
  AND storage_path_allowed_for_user(name)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'view') OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

DROP POLICY IF EXISTS "Bookings access upload booking-proofs" ON storage.objects;
CREATE POLICY "Bookings access upload booking-proofs" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'booking-proofs'
  AND storage_path_allowed_for_user(name)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

DROP POLICY IF EXISTS "Bookings access update booking-proofs" ON storage.objects;
CREATE POLICY "Bookings access update booking-proofs" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'booking-proofs'
  AND storage_path_allowed_for_user(name)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

DROP POLICY IF EXISTS "Bookings access delete booking-proofs" ON storage.objects;
CREATE POLICY "Bookings access delete booking-proofs" ON storage.objects FOR DELETE
USING (
  bucket_id = 'booking-proofs'
  AND storage_path_allowed_for_user(name)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

-- supplier-docs
DROP POLICY IF EXISTS "Permitted read supplier-docs" ON storage.objects;
CREATE POLICY "Permitted read supplier-docs" ON storage.objects FOR SELECT
USING (
  bucket_id = 'supplier-docs'
  AND storage_path_allowed_for_user(name)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'supplier_documents', 'view'))
);

DROP POLICY IF EXISTS "Staff write supplier-docs" ON storage.objects;
CREATE POLICY "Staff write supplier-docs" ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'supplier-docs'
  AND storage_path_allowed_for_user(name)
  AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role))
);

DROP POLICY IF EXISTS "Staff update supplier-docs" ON storage.objects;
CREATE POLICY "Staff update supplier-docs" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'supplier-docs'
  AND storage_path_allowed_for_user(name)
  AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role))
);

DROP POLICY IF EXISTS "Staff delete supplier-docs" ON storage.objects;
CREATE POLICY "Staff delete supplier-docs" ON storage.objects FOR DELETE
USING (
  bucket_id = 'supplier-docs'
  AND storage_path_allowed_for_user(name)
  AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role))
);

-- invoice-docs
DROP POLICY IF EXISTS "Admins read invoice-docs" ON storage.objects;
CREATE POLICY "Admins read invoice-docs" ON storage.objects FOR SELECT
USING (bucket_id = 'invoice-docs' AND storage_path_allowed_for_user(name) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins write invoice-docs" ON storage.objects;
CREATE POLICY "Admins write invoice-docs" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoice-docs' AND storage_path_allowed_for_user(name) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins update invoice-docs" ON storage.objects;
CREATE POLICY "Admins update invoice-docs" ON storage.objects FOR UPDATE
USING (bucket_id = 'invoice-docs' AND storage_path_allowed_for_user(name) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins delete invoice-docs" ON storage.objects;
CREATE POLICY "Admins delete invoice-docs" ON storage.objects FOR DELETE
USING (bucket_id = 'invoice-docs' AND storage_path_allowed_for_user(name) AND is_admin(auth.uid()));

-- invoice-templates
DROP POLICY IF EXISTS "Admins can read invoice templates" ON storage.objects;
CREATE POLICY "Admins can read invoice templates" ON storage.objects FOR SELECT
USING (bucket_id = 'invoice-templates' AND storage_path_allowed_for_user(name) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can write invoice templates" ON storage.objects;
CREATE POLICY "Admins can write invoice templates" ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'invoice-templates' AND storage_path_allowed_for_user(name) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update invoice templates" ON storage.objects;
CREATE POLICY "Admins can update invoice templates" ON storage.objects FOR UPDATE
USING (bucket_id = 'invoice-templates' AND storage_path_allowed_for_user(name) AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete invoice templates" ON storage.objects;
CREATE POLICY "Admins can delete invoice templates" ON storage.objects FOR DELETE
USING (bucket_id = 'invoice-templates' AND storage_path_allowed_for_user(name) AND is_admin(auth.uid()));
