ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_lead_id ON public.bookings(lead_id);