
-- Helper function: true when the owner is an admin
CREATE OR REPLACE FUNCTION public.is_admin_owned(_created_by uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _created_by IS NOT NULL AND public.is_admin(_created_by);
$$;

-- ============ LEADS ============
DROP POLICY IF EXISTS "leads_select" ON public.leads;
CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (
    is_admin(auth.uid())
    OR (
      has_module_permission(auth.uid(), 'leads', 'view')
      AND ((has_role(auth.uid(), 'operador'::app_role) = false)
           OR auth.uid() = assigned_to
           OR auth.uid() = created_by
           OR is_subordinate_of(assigned_to, auth.uid())
           OR is_subordinate_of(created_by, auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "leads_update" ON public.leads;
CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (
    is_admin(auth.uid())
    OR (
      has_module_permission(auth.uid(), 'leads', 'edit')
      AND ((has_role(auth.uid(), 'operador'::app_role) = false)
           OR auth.uid() = assigned_to
           OR auth.uid() = created_by
           OR is_subordinate_of(assigned_to, auth.uid())
           OR is_subordinate_of(created_by, auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "leads_delete" ON public.leads;
CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'leads', 'delete'))
);

-- ============ CUSTOMERS ============
DROP POLICY IF EXISTS "Authenticated read customers" ON public.customers;
CREATE POLICY "Authenticated read customers" ON public.customers FOR SELECT TO authenticated
USING (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Owner or admin update customers" ON public.customers;
CREATE POLICY "Owner or admin update customers" ON public.customers FOR UPDATE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (auth.uid() = created_by OR is_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Admins delete customers" ON public.customers;
CREATE POLICY "Admins delete customers" ON public.customers FOR DELETE
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND is_admin(auth.uid())
);

-- ============ QUOTES ============
DROP POLICY IF EXISTS "quotes_select" ON public.quotes;
CREATE POLICY "quotes_select" ON public.quotes FOR SELECT TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'view'))
);

DROP POLICY IF EXISTS "quotes_update" ON public.quotes;
CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'edit'))
);

DROP POLICY IF EXISTS "quotes_delete" ON public.quotes;
CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'delete'))
);

-- ============ QUOTE_ITEMS (filhos de quotes) ============
DROP POLICY IF EXISTS "quote_items_select" ON public.quote_items;
CREATE POLICY "quote_items_select" ON public.quote_items FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
          AND (NOT public.is_admin_owned(q.created_by) OR auth.uid() = q.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'view'))
);

DROP POLICY IF EXISTS "quote_items_update" ON public.quote_items;
CREATE POLICY "quote_items_update" ON public.quote_items FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
          AND (NOT public.is_admin_owned(q.created_by) OR auth.uid() = q.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'edit'))
);

DROP POLICY IF EXISTS "quote_items_delete" ON public.quote_items;
CREATE POLICY "quote_items_delete" ON public.quote_items FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_items.quote_id
          AND (NOT public.is_admin_owned(q.created_by) OR auth.uid() = q.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'edit') OR has_module_permission(auth.uid(), 'quotes', 'delete'))
);

-- ============ QUOTE_FLIGHTS ============
DROP POLICY IF EXISTS "quote_flights_select" ON public.quote_flights;
CREATE POLICY "quote_flights_select" ON public.quote_flights FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_flights.quote_id
          AND (NOT public.is_admin_owned(q.created_by) OR auth.uid() = q.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'view'))
);

DROP POLICY IF EXISTS "quote_flights_update" ON public.quote_flights;
CREATE POLICY "quote_flights_update" ON public.quote_flights FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_flights.quote_id
          AND (NOT public.is_admin_owned(q.created_by) OR auth.uid() = q.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'edit'))
);

DROP POLICY IF EXISTS "quote_flights_delete" ON public.quote_flights;
CREATE POLICY "quote_flights_delete" ON public.quote_flights FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_flights.quote_id
          AND (NOT public.is_admin_owned(q.created_by) OR auth.uid() = q.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'quotes', 'edit') OR has_module_permission(auth.uid(), 'quotes', 'delete'))
);

-- ============ BOOKINGS ============
DROP POLICY IF EXISTS "bookings_select" ON public.bookings;
CREATE POLICY "bookings_select" ON public.bookings FOR SELECT TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'view'))
);

DROP POLICY IF EXISTS "bookings_update" ON public.bookings;
CREATE POLICY "bookings_update" ON public.bookings FOR UPDATE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

DROP POLICY IF EXISTS "bookings_delete" ON public.bookings;
CREATE POLICY "bookings_delete" ON public.bookings FOR DELETE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'delete'))
);

-- ============ BOOKING_PAX ============
DROP POLICY IF EXISTS "booking_pax_select" ON public.booking_pax;
CREATE POLICY "booking_pax_select" ON public.booking_pax FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_pax.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'view'))
);

DROP POLICY IF EXISTS "booking_pax_update" ON public.booking_pax;
CREATE POLICY "booking_pax_update" ON public.booking_pax FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_pax.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

DROP POLICY IF EXISTS "booking_pax_delete" ON public.booking_pax;
CREATE POLICY "booking_pax_delete" ON public.booking_pax FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_pax.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit') OR has_module_permission(auth.uid(), 'bookings', 'delete'))
);

-- ============ BOOKING_SUPPLIERS ============
DROP POLICY IF EXISTS "booking_suppliers_select" ON public.booking_suppliers;
CREATE POLICY "booking_suppliers_select" ON public.booking_suppliers FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_suppliers.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'view'))
);

DROP POLICY IF EXISTS "booking_suppliers_update" ON public.booking_suppliers;
CREATE POLICY "booking_suppliers_update" ON public.booking_suppliers FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_suppliers.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

DROP POLICY IF EXISTS "booking_suppliers_delete" ON public.booking_suppliers;
CREATE POLICY "booking_suppliers_delete" ON public.booking_suppliers FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_suppliers.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit') OR has_module_permission(auth.uid(), 'bookings', 'delete'))
);

-- ============ BOOKING_ITEM_CONFIRMATIONS ============
DROP POLICY IF EXISTS "booking_conf_select" ON public.booking_item_confirmations;
CREATE POLICY "booking_conf_select" ON public.booking_item_confirmations FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_item_confirmations.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'view'))
);

DROP POLICY IF EXISTS "booking_conf_update" ON public.booking_item_confirmations;
CREATE POLICY "booking_conf_update" ON public.booking_item_confirmations FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_item_confirmations.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit'))
);

DROP POLICY IF EXISTS "booking_conf_delete" ON public.booking_item_confirmations;
CREATE POLICY "booking_conf_delete" ON public.booking_item_confirmations FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_item_confirmations.booking_id
          AND (NOT public.is_admin_owned(b.created_by) OR auth.uid() = b.created_by))
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'bookings', 'edit') OR has_module_permission(auth.uid(), 'bookings', 'delete'))
);

-- ============ INTERACTIONS ============
DROP POLICY IF EXISTS "Authenticated read interactions" ON public.interactions;
CREATE POLICY "Authenticated read interactions" ON public.interactions FOR SELECT TO authenticated
USING (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Owner or admin manage interactions" ON public.interactions;
CREATE POLICY "Owner or admin manage interactions" ON public.interactions FOR UPDATE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (auth.uid() = created_by OR is_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Owner or admin delete interactions" ON public.interactions;
CREATE POLICY "Owner or admin delete interactions" ON public.interactions FOR DELETE
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (auth.uid() = created_by OR is_admin(auth.uid()))
);

-- ============ OPERATIONS_ACTIVITIES ============
DROP POLICY IF EXISTS "Authenticated read operations_activities" ON public.operations_activities;
CREATE POLICY "Authenticated read operations_activities" ON public.operations_activities FOR SELECT TO authenticated
USING (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Owner/admin/op update operations_activities" ON public.operations_activities;
CREATE POLICY "Owner/admin/op update operations_activities" ON public.operations_activities FOR UPDATE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (auth.uid() = created_by OR is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role))
);

DROP POLICY IF EXISTS "Owner/admin/op delete operations_activities" ON public.operations_activities;
CREATE POLICY "Owner/admin/op delete operations_activities" ON public.operations_activities FOR DELETE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (auth.uid() = created_by OR is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role))
);

-- ============ ITINERARIES ============
DROP POLICY IF EXISTS "Authenticated read itineraries" ON public.itineraries;
CREATE POLICY "Authenticated read itineraries" ON public.itineraries FOR SELECT TO authenticated
USING (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by);

DROP POLICY IF EXISTS "Staff update itineraries" ON public.itineraries;
CREATE POLICY "Staff update itineraries" ON public.itineraries FOR UPDATE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role) OR auth.uid() = created_by)
);

DROP POLICY IF EXISTS "Staff delete itineraries" ON public.itineraries;
CREATE POLICY "Staff delete itineraries" ON public.itineraries FOR DELETE TO authenticated
USING (
  (NOT public.is_admin_owned(created_by) OR auth.uid() = created_by)
  AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role))
);
