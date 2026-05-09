
-- Extend vouchers for per-item vouchers with editable fields
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS quote_item_id uuid REFERENCES public.quote_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS meeting_point text,
  ADD COLUMN IF NOT EXISTS meeting_time text,
  ADD COLUMN IF NOT EXISTS service_date date,
  ADD COLUMN IF NOT EXISTS customer_instructions text,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS updated_by uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_vouchers_booking_item
  ON public.vouchers(booking_id, quote_item_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_vouchers_booking_item
  ON public.vouchers(booking_id, quote_item_id)
  WHERE quote_item_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_vouchers_updated_at ON public.vouchers;
CREATE TRIGGER update_vouchers_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Voucher send history
CREATE TABLE IF NOT EXISTS public.voucher_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id uuid NOT NULL REFERENCES public.vouchers(id) ON DELETE CASCADE,
  sent_to text NOT NULL,
  sent_cc text,
  subject text,
  body_text text,
  status text NOT NULL,
  error_message text,
  gmail_message_id text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_voucher_send_log_voucher
  ON public.voucher_send_log(voucher_id, created_at DESC);

ALTER TABLE public.voucher_send_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read voucher_send_log"
  ON public.voucher_send_log FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated insert voucher_send_log"
  ON public.voucher_send_log FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_module_permission(auth.uid(), 'bookings', 'edit')
    OR public.has_module_permission(auth.uid(), 'bookings', 'view')
  );

CREATE POLICY "Admin delete voucher_send_log"
  ON public.voucher_send_log FOR DELETE
  TO authenticated USING (public.is_admin(auth.uid()));
