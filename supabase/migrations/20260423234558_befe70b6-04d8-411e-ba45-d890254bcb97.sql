-- Add structured fields to quote_items for hotel/service line items with dates
ALTER TABLE public.quote_items
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'service',
  ADD COLUMN IF NOT EXISTS item_date date,
  ADD COLUMN IF NOT EXISTS check_out date,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS meal_plan text,
  ADD COLUMN IF NOT EXISTS rooms integer,
  ADD COLUMN IF NOT EXISTS nights integer,
  ADD COLUMN IF NOT EXISTS pax integer,
  ADD COLUMN IF NOT EXISTS ways integer;

-- Constrain kind to known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_items_kind_check'
  ) THEN
    ALTER TABLE public.quote_items
      ADD CONSTRAINT quote_items_kind_check CHECK (kind IN ('hotel','service'));
  END IF;
END $$;