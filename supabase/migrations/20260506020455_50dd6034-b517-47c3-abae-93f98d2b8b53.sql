CREATE INDEX IF NOT EXISTS idx_suppliers_created_by_at ON public.suppliers(created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_customers_created_by_at ON public.customers(created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_created_by_at ON public.leads(created_by, created_at);
CREATE INDEX IF NOT EXISTS idx_suppliers_code ON public.suppliers(code);
CREATE INDEX IF NOT EXISTS idx_customers_code ON public.customers(code);
CREATE INDEX IF NOT EXISTS idx_leads_code ON public.leads(code);