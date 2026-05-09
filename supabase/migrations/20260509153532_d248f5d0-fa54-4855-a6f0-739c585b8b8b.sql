DROP POLICY IF EXISTS "Admin/op manage vouchers" ON public.vouchers;
DROP POLICY IF EXISTS "Authenticated read vouchers" ON public.vouchers;

CREATE POLICY "View vouchers" ON public.vouchers
FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'view'));

CREATE POLICY "Insert vouchers" ON public.vouchers
FOR INSERT TO authenticated
WITH CHECK (
  (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit'))
  AND created_by = auth.uid()
);

CREATE POLICY "Update vouchers" ON public.vouchers
FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit'))
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit'));

CREATE POLICY "Delete vouchers" ON public.vouchers
FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));