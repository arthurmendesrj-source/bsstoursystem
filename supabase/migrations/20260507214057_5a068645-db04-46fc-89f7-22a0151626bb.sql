
-- Status enum para invoices
DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM (
    'draft', 'pending_approval', 'issued', 'paid', 'overdue', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text UNIQUE,
  booking_id uuid,
  quote_id uuid,
  customer_id uuid,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  currency public.currency_code NOT NULL DEFAULT 'BRL',
  subtotal numeric NOT NULL DEFAULT 0,
  taxes numeric NOT NULL DEFAULT 0,
  fees numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  parcels jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_instructions text,
  notes text,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_booking ON public.invoices(booking_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select ON public.invoices FOR SELECT TO authenticated
USING (
  ((NOT public.is_admin_owned(created_by)) OR (auth.uid() = created_by))
  AND (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(),'bookings','view'))
);

CREATE POLICY invoices_insert ON public.invoices FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(),'bookings','create') OR public.has_module_permission(auth.uid(),'bookings','edit'))
);

CREATE POLICY invoices_update ON public.invoices FOR UPDATE TO authenticated
USING (
  ((NOT public.is_admin_owned(created_by)) OR (auth.uid() = created_by))
  AND (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(),'bookings','edit'))
);

CREATE POLICY invoices_delete ON public.invoices FOR DELETE TO authenticated
USING (
  ((NOT public.is_admin_owned(created_by)) OR (auth.uid() = created_by))
  AND (public.is_admin(auth.uid()) OR public.has_module_permission(auth.uid(),'bookings','delete'))
);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
BEFORE UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- log activity (uses existing log_activity trigger function)
DROP TRIGGER IF EXISTS trg_invoices_log_ins ON public.invoices;
CREATE TRIGGER trg_invoices_log_ins
AFTER INSERT ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.log_activity('invoice', '{status,total}');

DROP TRIGGER IF EXISTS trg_invoices_log_upd ON public.invoices;
CREATE TRIGGER trg_invoices_log_upd
AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.log_activity('invoice', '{status,total,due_at,issued_at,paid_at,cancelled_at}');
