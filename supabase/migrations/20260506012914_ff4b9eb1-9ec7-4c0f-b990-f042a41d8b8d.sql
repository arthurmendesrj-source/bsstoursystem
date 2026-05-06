
-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-docs', 'supplier-docs', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated read supplier-docs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'supplier-docs');

CREATE POLICY "Staff write supplier-docs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'supplier-docs'
  AND (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional') OR has_role(auth.uid(),'vendedor'))
);

CREATE POLICY "Staff update supplier-docs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'supplier-docs'
  AND (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional'))
);

CREATE POLICY "Staff delete supplier-docs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'supplier-docs'
  AND (is_admin(auth.uid()) OR has_role(auth.uid(),'operacional'))
);

-- supplier_documents table
CREATE TABLE public.supplier_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  file_format text NOT NULL,
  file_size_bytes bigint,
  language text,
  year integer,
  kind text NOT NULL DEFAULT 'tarifario',
  notes text,
  contacts_extracted_at timestamptz,
  rates_extracted_at timestamptz,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_documents_supplier ON public.supplier_documents(supplier_id);

ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read supplier_documents"
ON public.supplier_documents FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage supplier_documents"
ON public.supplier_documents FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_documents.supplier_id
    AND (s.created_by = auth.uid() OR is_admin(auth.uid()) OR has_role(auth.uid(),'operacional')))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_documents.supplier_id
    AND (s.created_by = auth.uid() OR is_admin(auth.uid()) OR has_role(auth.uid(),'operacional')))
);

CREATE TRIGGER trg_supplier_documents_updated
BEFORE UPDATE ON public.supplier_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- supplier_rates table
CREATE TABLE public.supplier_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.supplier_documents(id) ON DELETE SET NULL,
  service_name text NOT NULL,
  service_type text,
  city text,
  category text,
  language text,
  pax_min integer,
  pax_max integer,
  unit_price numeric NOT NULL DEFAULT 0,
  currency public.currency_code NOT NULL DEFAULT 'USD',
  unit text DEFAULT 'per_person',
  valid_from date,
  valid_until date,
  raw_excerpt text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX idx_supplier_rates_supplier ON public.supplier_rates(supplier_id);
CREATE INDEX idx_supplier_rates_doc ON public.supplier_rates(document_id);

ALTER TABLE public.supplier_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read supplier_rates"
ON public.supplier_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff manage supplier_rates"
ON public.supplier_rates FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_rates.supplier_id
    AND (s.created_by = auth.uid() OR is_admin(auth.uid()) OR has_role(auth.uid(),'operacional')))
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.suppliers s WHERE s.id = supplier_rates.supplier_id
    AND (s.created_by = auth.uid() OR is_admin(auth.uid()) OR has_role(auth.uid(),'operacional')))
);

CREATE TRIGGER trg_supplier_rates_updated
BEFORE UPDATE ON public.supplier_rates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
