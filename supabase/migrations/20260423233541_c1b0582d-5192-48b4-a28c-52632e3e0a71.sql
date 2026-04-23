-- Add markup support to quotes and quote_items
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS default_markup_pct numeric NOT NULL DEFAULT 0;

ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS unit_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS markup_pct numeric NOT NULL DEFAULT 0;

-- Backfill: existing items use unit_price as cost (markup 0)
UPDATE public.quote_items SET unit_cost = unit_price WHERE unit_cost = 0 AND unit_price > 0;