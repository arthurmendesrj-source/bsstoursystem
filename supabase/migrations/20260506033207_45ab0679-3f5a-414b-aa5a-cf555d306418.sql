ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS guide_type text,
  ADD COLUMN IF NOT EXISTS notes text;