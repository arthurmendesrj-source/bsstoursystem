-- Confirmations table
CREATE TABLE public.booking_item_confirmations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  quote_item_id uuid not null,
  status text not null default 'pendente',
  proof_type text,
  proof_storage_path text,
  proof_text text,
  proof_reference text,
  notes text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, quote_item_id)
);

ALTER TABLE public.booking_item_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read booking_item_confirmations"
ON public.booking_item_confirmations FOR SELECT TO authenticated USING (true);

CREATE POLICY "Manage booking_item_confirmations if owns booking"
ON public.booking_item_confirmations FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_item_confirmations.booking_id
  AND (b.created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'operacional'::app_role))))
WITH CHECK (EXISTS (SELECT 1 FROM public.bookings b WHERE b.id = booking_item_confirmations.booking_id
  AND (b.created_by = auth.uid() OR public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'operacional'::app_role))));

CREATE TRIGGER trg_bic_updated_at
BEFORE UPDATE ON public.booking_item_confirmations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for proofs (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('booking-proofs','booking-proofs', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth read booking-proofs"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'booking-proofs');

CREATE POLICY "Auth upload booking-proofs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'booking-proofs');

CREATE POLICY "Auth update booking-proofs"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'booking-proofs');

CREATE POLICY "Auth delete booking-proofs"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'booking-proofs');