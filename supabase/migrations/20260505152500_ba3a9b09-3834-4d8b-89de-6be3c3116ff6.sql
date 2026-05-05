CREATE TABLE public.sla_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage lead_status NOT NULL UNIQUE,
  warning_hours integer NOT NULL CHECK (warning_hours > 0),
  overdue_hours integer NOT NULL CHECK (overdue_hours > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.sla_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sla_settings"
  ON public.sla_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage sla_settings"
  ON public.sla_settings FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER sla_settings_updated_at
  BEFORE UPDATE ON public.sla_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.sla_settings (stage, warning_hours, overdue_hours) VALUES
  ('novo', 24, 48),
  ('qualificado', 96, 120),
  ('cotacao', 144, 168),
  ('proposta', 144, 168)
ON CONFLICT (stage) DO NOTHING;