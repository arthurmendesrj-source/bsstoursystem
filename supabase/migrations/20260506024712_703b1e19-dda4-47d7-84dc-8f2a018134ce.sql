
CREATE TABLE public.ref_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country text,
  state text,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country, slug)
);

CREATE TABLE public.ref_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('transfer','tour','hotel','restaurant','outro')),
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ref_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category_id uuid REFERENCES public.ref_service_categories(id) ON DELETE SET NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

ALTER TABLE public.ref_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ref_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read ref_cities" ON public.ref_cities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage ref_cities" ON public.ref_cities FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional'));

CREATE POLICY "Authenticated read ref_service_categories" ON public.ref_service_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage ref_service_categories" ON public.ref_service_categories FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional'));

CREATE POLICY "Authenticated read ref_services" ON public.ref_services FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage ref_services" ON public.ref_services FOR ALL TO authenticated
  USING (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional'));

ALTER TABLE public.supplier_rates
  ADD COLUMN city_id uuid REFERENCES public.ref_cities(id) ON DELETE SET NULL,
  ADD COLUMN category_id uuid REFERENCES public.ref_service_categories(id) ON DELETE SET NULL,
  ADD COLUMN service_id uuid REFERENCES public.ref_services(id) ON DELETE SET NULL;

CREATE INDEX idx_supplier_rates_city_id ON public.supplier_rates(city_id);
CREATE INDEX idx_supplier_rates_category_id ON public.supplier_rates(category_id);
CREATE INDEX idx_supplier_rates_service_id ON public.supplier_rates(service_id);

INSERT INTO public.ref_service_categories (name, kind, slug) VALUES
  ('Transfer','transfer','transfer'),
  ('Tour','tour','tour'),
  ('Hotel','hotel','hotel'),
  ('Restaurante','restaurant','restaurant'),
  ('Outro','outro','outro');
