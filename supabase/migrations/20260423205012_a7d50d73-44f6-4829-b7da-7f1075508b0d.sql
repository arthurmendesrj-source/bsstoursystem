-- ===== ENUMS =====
CREATE TYPE public.customer_type AS ENUM ('pf', 'pj');
CREATE TYPE public.customer_status AS ENUM ('ativo', 'inativo', 'bloqueado');
CREATE TYPE public.supplier_category AS ENUM ('hotel', 'aerea', 'receptivo', 'transfer', 'seguro', 'operadora', 'passeio', 'aluguel_carro', 'outro');
CREATE TYPE public.supplier_status AS ENUM ('ativo', 'inativo', 'homologacao');

-- ===== EXPAND CUSTOMERS =====
ALTER TABLE public.customers
  ADD COLUMN type public.customer_type NOT NULL DEFAULT 'pf',
  ADD COLUMN company_name text,
  ADD COLUMN trade_name text,
  ADD COLUMN tax_id text,
  ADD COLUMN address_street text,
  ADD COLUMN address_number text,
  ADD COLUMN address_complement text,
  ADD COLUMN address_district text,
  ADD COLUMN address_city text,
  ADD COLUMN address_state text,
  ADD COLUMN address_country text,
  ADD COLUMN address_zip text,
  ADD COLUMN whatsapp text,
  ADD COLUMN secondary_email text,
  ADD COLUMN gender text,
  ADD COLUMN marital_status text,
  ADD COLUMN emergency_contact_name text,
  ADD COLUMN emergency_contact_phone text,
  ADD COLUMN tags text[] DEFAULT '{}'::text[],
  ADD COLUMN status public.customer_status NOT NULL DEFAULT 'ativo',
  ADD COLUMN origin text;

CREATE INDEX idx_customers_status ON public.customers(status);
CREATE INDEX idx_customers_type ON public.customers(type);
CREATE INDEX idx_customers_tax_id ON public.customers(tax_id);

-- ===== SUPPLIERS =====
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  trade_name text,
  tax_id text,
  category public.supplier_category NOT NULL DEFAULT 'outro',
  status public.supplier_status NOT NULL DEFAULT 'ativo',
  contact_name text,
  email text,
  phone text,
  whatsapp text,
  website text,
  address_street text,
  address_number text,
  address_complement text,
  address_district text,
  address_city text,
  address_state text,
  address_country text,
  address_zip text,
  payment_terms text,
  default_currency public.currency_code NOT NULL DEFAULT 'BRL',
  commission_pct numeric DEFAULT 0,
  iata_code text,
  cadastur text,
  notes text,
  tags text[] DEFAULT '{}'::text[],
  rating smallint CHECK (rating >= 1 AND rating <= 5),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_category ON public.suppliers(category);
CREATE INDEX idx_suppliers_status ON public.suppliers(status);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated insert suppliers" ON public.suppliers
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Owner or admin update suppliers" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operacional'::app_role));
CREATE POLICY "Admins delete suppliers" ON public.suppliers
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== SUPPLIER CONTACTS =====
CREATE TABLE public.supplier_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text,
  email text,
  phone text,
  whatsapp text,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_contacts_supplier ON public.supplier_contacts(supplier_id);

ALTER TABLE public.supplier_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read supplier_contacts" ON public.supplier_contacts
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage supplier_contacts if owns supplier" ON public.supplier_contacts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_contacts.supplier_id
    AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operacional'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_contacts.supplier_id
    AND (s.created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operacional'::app_role))));

-- ===== BOOKING SUPPLIERS (N:N) =====
CREATE TABLE public.booking_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  service_type text,
  confirmation_code text,
  cost numeric DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  status text DEFAULT 'pendente',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_suppliers_booking ON public.booking_suppliers(booking_id);
CREATE INDEX idx_booking_suppliers_supplier ON public.booking_suppliers(supplier_id);

ALTER TABLE public.booking_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read booking_suppliers" ON public.booking_suppliers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manage booking_suppliers if owns booking" ON public.booking_suppliers
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_suppliers.booking_id
    AND (b.created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operacional'::app_role))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_suppliers.booking_id
    AND (b.created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'operacional'::app_role))));

-- ===== CROSS LINKS =====
ALTER TABLE public.bookings ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.emails ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.interactions ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;
ALTER TABLE public.tasks ADD COLUMN supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX idx_bookings_supplier ON public.bookings(supplier_id);
CREATE INDEX idx_emails_supplier ON public.emails(supplier_id);
CREATE INDEX idx_interactions_supplier ON public.interactions(supplier_id);
CREATE INDEX idx_tasks_supplier ON public.tasks(supplier_id);