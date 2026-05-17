
DROP POLICY IF EXISTS "Authenticated read activity_log" ON public.activity_log;
CREATE POLICY "Read own or admin activity_log"
ON public.activity_log FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR auth.uid() = actor_id);

DROP POLICY IF EXISTS "Authenticated read tasks" ON public.tasks;
CREATE POLICY "Read own/assigned/admin tasks"
ON public.tasks FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR auth.uid() = created_by
  OR auth.uid() = assigned_to
  OR is_subordinate_of(assigned_to, auth.uid())
);

DROP POLICY IF EXISTS "qin_select" ON public.quote_item_notes;
CREATE POLICY "qin_select"
ON public.quote_item_notes FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_item_notes.quote_id
      AND ((NOT is_admin_owned(q.created_by)) OR auth.uid() = q.created_by)
      AND has_module_permission(auth.uid(), 'quotes', 'view')
  )
);

DROP POLICY IF EXISTS "Authenticated users can view quote documents" ON public.quote_documents;
CREATE POLICY "View quote documents via parent quote"
ON public.quote_documents FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.quotes q
    WHERE q.id = quote_documents.quote_id
      AND ((NOT is_admin_owned(q.created_by)) OR auth.uid() = q.created_by)
      AND has_module_permission(auth.uid(), 'quotes', 'view')
  )
);

DROP POLICY IF EXISTS "Authenticated read itinerary_chunks" ON public.itinerary_chunks;
CREATE POLICY "Staff read itinerary_chunks"
ON public.itinerary_chunks FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role));

DROP POLICY IF EXISTS "Authenticated read voucher_send_log" ON public.voucher_send_log;
CREATE POLICY "Admin or bookings access read voucher_send_log"
ON public.voucher_send_log FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR has_module_permission(auth.uid(), 'bookings', 'view')
  OR has_module_permission(auth.uid(), 'bookings', 'edit')
);

CREATE POLICY "Users insert own gmail tokens"
ON public.user_gmail_tokens FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own gmail tokens"
ON public.user_gmail_tokens FOR UPDATE TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own gmail tokens"
ON public.user_gmail_tokens FOR DELETE TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated can read invoice docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can write invoice docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update invoice docs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete invoice docs" ON storage.objects;

CREATE POLICY "Admins read invoice-docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'invoice-docs' AND is_admin(auth.uid()));

CREATE POLICY "Admins write invoice-docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'invoice-docs' AND is_admin(auth.uid()));

CREATE POLICY "Admins update invoice-docs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'invoice-docs' AND is_admin(auth.uid()));

CREATE POLICY "Admins delete invoice-docs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'invoice-docs' AND is_admin(auth.uid()));

DROP POLICY IF EXISTS "Auth read booking-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Auth upload booking-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Auth update booking-proofs" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete booking-proofs" ON storage.objects;

CREATE POLICY "Bookings access read booking-proofs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'booking-proofs'
  AND (
    is_admin(auth.uid())
    OR has_module_permission(auth.uid(), 'bookings', 'view')
    OR has_module_permission(auth.uid(), 'bookings', 'edit')
  )
);

CREATE POLICY "Bookings access upload booking-proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'booking-proofs'
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

CREATE POLICY "Bookings access update booking-proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'booking-proofs'
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

CREATE POLICY "Bookings access delete booking-proofs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'booking-proofs'
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

DROP POLICY IF EXISTS "Authenticated users can read proposal docs" ON storage.objects;
CREATE POLICY "Owners or admins read proposal-docs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'proposal-docs'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
  )
);
