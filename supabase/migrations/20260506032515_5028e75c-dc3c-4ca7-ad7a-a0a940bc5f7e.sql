CREATE TABLE public.quote_flights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  flight_date date NOT NULL,
  flight_number text NOT NULL,
  from_code text NOT NULL,
  to_code text NOT NULL,
  departure_time time NOT NULL,
  arrival_time time,
  pax integer NOT NULL DEFAULT 1,
  total numeric(12,2),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quote_flights_quote_id ON public.quote_flights(quote_id);

ALTER TABLE public.quote_flights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read quote_flights"
  ON public.quote_flights FOR SELECT TO authenticated USING (true);

CREATE POLICY "Insert quote_flights if owns quote"
  ON public.quote_flights FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_flights.quote_id AND (q.created_by = auth.uid() OR is_admin(auth.uid()))));

CREATE POLICY "Update quote_flights if owns quote"
  ON public.quote_flights FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_flights.quote_id AND (q.created_by = auth.uid() OR is_admin(auth.uid()))));

CREATE POLICY "Delete quote_flights if owns quote"
  ON public.quote_flights FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_flights.quote_id AND (q.created_by = auth.uid() OR is_admin(auth.uid()))));

CREATE TRIGGER update_quote_flights_updated_at
  BEFORE UPDATE ON public.quote_flights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();