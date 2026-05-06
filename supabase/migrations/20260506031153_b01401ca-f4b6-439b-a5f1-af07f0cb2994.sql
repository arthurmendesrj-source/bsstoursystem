ALTER TABLE public.operations_activities
  ADD COLUMN IF NOT EXISTS hotel text,
  ADD COLUMN IF NOT EXISTS driver text,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS guide text,
  ADD COLUMN IF NOT EXISTS pax_count integer;