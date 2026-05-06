-- Temporarily disable supplier code trigger to allow bulk import
ALTER TABLE public.suppliers DISABLE TRIGGER trg_set_supplier_code;