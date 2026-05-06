
-- Helper: check if user has view permission on a module (used for SELECT)
-- We rely on existing has_module_permission(_user_id, _module, _action)

-- ============ LEADS ============
DROP POLICY IF EXISTS "Admins delete leads" ON public.leads;
DROP POLICY IF EXISTS "Assigned or admin update leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated insert leads" ON public.leads;
DROP POLICY IF EXISTS "Authenticated read leads" ON public.leads;

CREATE POLICY "leads_select" ON public.leads FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    public.has_module_permission(auth.uid(), 'leads', 'view')
    AND (
      -- operador only sees own/assigned; others with view see all
      public.has_role(auth.uid(), 'operador') = false
      OR auth.uid() = assigned_to
      OR auth.uid() = created_by
    )
  )
);

CREATE POLICY "leads_insert" ON public.leads FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'leads', 'create'))
);

CREATE POLICY "leads_update" ON public.leads FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (
    public.has_module_permission(auth.uid(), 'leads', 'edit')
    AND (
      public.has_role(auth.uid(), 'operador') = false
      OR auth.uid() = assigned_to
      OR auth.uid() = created_by
    )
  )
);

CREATE POLICY "leads_delete" ON public.leads FOR DELETE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.has_module_permission(auth.uid(), 'leads', 'delete')
);

-- ============ QUOTES ============
DROP POLICY IF EXISTS "Admins delete quotes" ON public.quotes;
DROP POLICY IF EXISTS "Authenticated insert quotes" ON public.quotes;
DROP POLICY IF EXISTS "Authenticated read quotes" ON public.quotes;
DROP POLICY IF EXISTS "Owner or admin update quotes" ON public.quotes;

CREATE POLICY "quotes_select" ON public.quotes FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'view'));

CREATE POLICY "quotes_insert" ON public.quotes FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'create'))
);

CREATE POLICY "quotes_update" ON public.quotes FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'edit'));

CREATE POLICY "quotes_delete" ON public.quotes FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'delete'));

-- quote_items
DROP POLICY IF EXISTS "Authenticated read quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Delete quote_items if owns quote" ON public.quote_items;
DROP POLICY IF EXISTS "Insert quote_items if owns quote" ON public.quote_items;
DROP POLICY IF EXISTS "Update quote_items if owns quote" ON public.quote_items;

CREATE POLICY "quote_items_select" ON public.quote_items FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'view'));
CREATE POLICY "quote_items_insert" ON public.quote_items FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'edit') OR public.has_module_permission(auth.uid(), 'quotes', 'create'));
CREATE POLICY "quote_items_update" ON public.quote_items FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'edit'));
CREATE POLICY "quote_items_delete" ON public.quote_items FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'edit') OR public.has_module_permission(auth.uid(), 'quotes', 'delete'));

-- quote_flights
DROP POLICY IF EXISTS "Authenticated read quote_flights" ON public.quote_flights;
DROP POLICY IF EXISTS "Delete quote_flights if owns quote" ON public.quote_flights;
DROP POLICY IF EXISTS "Insert quote_flights if owns quote" ON public.quote_flights;
DROP POLICY IF EXISTS "Update quote_flights if owns quote" ON public.quote_flights;

CREATE POLICY "quote_flights_select" ON public.quote_flights FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'view'));
CREATE POLICY "quote_flights_insert" ON public.quote_flights FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'edit') OR public.has_module_permission(auth.uid(), 'quotes', 'create'));
CREATE POLICY "quote_flights_update" ON public.quote_flights FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'edit'));
CREATE POLICY "quote_flights_delete" ON public.quote_flights FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'quotes', 'edit') OR public.has_module_permission(auth.uid(), 'quotes', 'delete'));

-- ============ BOOKINGS ============
DROP POLICY IF EXISTS "Admins delete bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated insert bookings" ON public.bookings;
DROP POLICY IF EXISTS "Authenticated read bookings" ON public.bookings;
DROP POLICY IF EXISTS "Owner or admin update bookings" ON public.bookings;

CREATE POLICY "bookings_select" ON public.bookings FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'view'));
CREATE POLICY "bookings_insert" ON public.bookings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by AND (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'create')));
CREATE POLICY "bookings_update" ON public.bookings FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit'));
CREATE POLICY "bookings_delete" ON public.bookings FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'delete'));

-- booking_suppliers
DROP POLICY IF EXISTS "Authenticated read booking_suppliers" ON public.booking_suppliers;
DROP POLICY IF EXISTS "Manage booking_suppliers if owns booking" ON public.booking_suppliers;

CREATE POLICY "booking_suppliers_select" ON public.booking_suppliers FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'view'));
CREATE POLICY "booking_suppliers_insert" ON public.booking_suppliers FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit') OR public.has_module_permission(auth.uid(), 'bookings', 'create'));
CREATE POLICY "booking_suppliers_update" ON public.booking_suppliers FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit'));
CREATE POLICY "booking_suppliers_delete" ON public.booking_suppliers FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit') OR public.has_module_permission(auth.uid(), 'bookings', 'delete'));

-- booking_pax
DROP POLICY IF EXISTS "Authenticated read booking_pax" ON public.booking_pax;
DROP POLICY IF EXISTS "Delete booking_pax if owns booking" ON public.booking_pax;
DROP POLICY IF EXISTS "Insert booking_pax if owns booking" ON public.booking_pax;
DROP POLICY IF EXISTS "Update booking_pax if owns booking" ON public.booking_pax;

CREATE POLICY "booking_pax_select" ON public.booking_pax FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'view'));
CREATE POLICY "booking_pax_insert" ON public.booking_pax FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit') OR public.has_module_permission(auth.uid(), 'bookings', 'create'));
CREATE POLICY "booking_pax_update" ON public.booking_pax FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit'));
CREATE POLICY "booking_pax_delete" ON public.booking_pax FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit') OR public.has_module_permission(auth.uid(), 'bookings', 'delete'));

-- booking_item_confirmations
DROP POLICY IF EXISTS "Authenticated read booking_item_confirmations" ON public.booking_item_confirmations;
DROP POLICY IF EXISTS "Manage booking_item_confirmations if owns booking" ON public.booking_item_confirmations;

CREATE POLICY "booking_conf_select" ON public.booking_item_confirmations FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'view'));
CREATE POLICY "booking_conf_insert" ON public.booking_item_confirmations FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit') OR public.has_module_permission(auth.uid(), 'bookings', 'create'));
CREATE POLICY "booking_conf_update" ON public.booking_item_confirmations FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit'));
CREATE POLICY "booking_conf_delete" ON public.booking_item_confirmations FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'bookings', 'edit') OR public.has_module_permission(auth.uid(), 'bookings', 'delete'));

-- ============ SUPPLIERS ============
-- Drop existing policies dynamically
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='suppliers' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.suppliers', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "suppliers_select" ON public.suppliers FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'suppliers', 'view'));
CREATE POLICY "suppliers_insert" ON public.suppliers FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'suppliers', 'create'));
CREATE POLICY "suppliers_update" ON public.suppliers FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'suppliers', 'edit'));
CREATE POLICY "suppliers_delete" ON public.suppliers FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'suppliers', 'delete'));

-- supplier_contacts
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='supplier_contacts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.supplier_contacts', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "supplier_contacts_select" ON public.supplier_contacts FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'suppliers', 'view'));
CREATE POLICY "supplier_contacts_insert" ON public.supplier_contacts FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'suppliers', 'edit') OR public.has_module_permission(auth.uid(), 'suppliers', 'create'));
CREATE POLICY "supplier_contacts_update" ON public.supplier_contacts FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'suppliers', 'edit'));
CREATE POLICY "supplier_contacts_delete" ON public.supplier_contacts FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'suppliers', 'edit') OR public.has_module_permission(auth.uid(), 'suppliers', 'delete'));

-- supplier_rates
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='supplier_rates' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.supplier_rates', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "supplier_rates_select" ON public.supplier_rates FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'supplier_rates', 'view'));
CREATE POLICY "supplier_rates_insert" ON public.supplier_rates FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'supplier_rates', 'create') OR public.has_module_permission(auth.uid(), 'supplier_rates', 'edit'));
CREATE POLICY "supplier_rates_update" ON public.supplier_rates FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'supplier_rates', 'edit'));
CREATE POLICY "supplier_rates_delete" ON public.supplier_rates FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'supplier_rates', 'delete') OR public.has_module_permission(auth.uid(), 'supplier_rates', 'edit'));

-- supplier_documents
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='supplier_documents' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.supplier_documents', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "supplier_documents_select" ON public.supplier_documents FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'supplier_documents', 'view'));
CREATE POLICY "supplier_documents_insert" ON public.supplier_documents FOR INSERT TO authenticated
WITH CHECK (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'supplier_documents', 'create') OR public.has_module_permission(auth.uid(), 'supplier_documents', 'edit'));
CREATE POLICY "supplier_documents_update" ON public.supplier_documents FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'supplier_documents', 'edit'));
CREATE POLICY "supplier_documents_delete" ON public.supplier_documents FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(), 'supplier_documents', 'delete') OR public.has_module_permission(auth.uid(), 'supplier_documents', 'edit'));
