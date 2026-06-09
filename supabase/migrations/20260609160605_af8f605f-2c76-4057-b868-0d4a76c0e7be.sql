
ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;
