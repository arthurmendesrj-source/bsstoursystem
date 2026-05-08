CREATE TABLE public.email_message_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  from_email TEXT,
  subject TEXT,
  snippet TEXT,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_eml_msg ON public.email_message_links(gmail_message_id);
CREATE INDEX idx_eml_thread ON public.email_message_links(gmail_thread_id);
CREATE INDEX idx_eml_lead ON public.email_message_links(lead_id);
CREATE INDEX idx_eml_customer ON public.email_message_links(customer_id);

ALTER TABLE public.email_message_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read email_message_links"
  ON public.email_message_links FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated insert email_message_links"
  ON public.email_message_links FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Owner or admin update email_message_links"
  ON public.email_message_links FOR UPDATE
  TO authenticated
  USING ((auth.uid() = created_by) OR is_admin(auth.uid()));

CREATE POLICY "Owner or admin delete email_message_links"
  ON public.email_message_links FOR DELETE
  TO authenticated
  USING ((auth.uid() = created_by) OR is_admin(auth.uid()));