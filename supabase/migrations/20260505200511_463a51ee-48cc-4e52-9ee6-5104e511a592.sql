
CREATE TABLE public.operations_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NULL,
  quote_item_id uuid NULL UNIQUE,
  invoice_code text NULL,
  pax_name text NULL,
  kind text NOT NULL DEFAULT 'service',
  description text NULL,
  city text NULL,
  activity_date date NULL,
  activity_time time NULL,
  status text NOT NULL DEFAULT 'pendente',
  notes text NULL,
  source text NOT NULL DEFAULT 'manual',
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ops_activities_date ON public.operations_activities(activity_date);
CREATE INDEX idx_ops_activities_booking ON public.operations_activities(booking_id);

ALTER TABLE public.operations_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read operations_activities"
  ON public.operations_activities FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated insert operations_activities"
  ON public.operations_activities FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owner/admin/op update operations_activities"
  ON public.operations_activities FOR UPDATE TO authenticated
  USING (auth.uid() = created_by OR is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role));

CREATE POLICY "Owner/admin/op delete operations_activities"
  ON public.operations_activities FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR is_admin(auth.uid()) OR has_role(auth.uid(), 'operacional'::app_role));

CREATE TRIGGER operations_activities_updated_at
  BEFORE UPDATE ON public.operations_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
