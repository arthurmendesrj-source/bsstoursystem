ALTER TABLE public.booking_item_confirmations
  ADD COLUMN IF NOT EXISTS supplier_id uuid NULL,
  ADD COLUMN IF NOT EXISTS supplier_name text NULL;

CREATE INDEX IF NOT EXISTS idx_bic_supplier_id ON public.booking_item_confirmations(supplier_id);