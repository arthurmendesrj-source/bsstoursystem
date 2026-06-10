
CREATE TABLE public.license_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  plan_code text NOT NULL,
  duration_days integer NOT NULL DEFAULT 365,
  max_uses integer NOT NULL DEFAULT 1,
  uses_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  redeemed_by_tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  redeemed_by_user_id uuid,
  redeemed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.license_codes TO authenticated;
GRANT ALL ON public.license_codes TO service_role;

ALTER TABLE public.license_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "license_codes_select_active" ON public.license_codes
  FOR SELECT TO authenticated
  USING (is_active = true);

CREATE TRIGGER license_codes_updated_at
  BEFORE UPDATE ON public.license_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.license_codes (code, plan_code, duration_days, max_uses)
VALUES ('BOSCO1', 'enterprise', 365, 1)
ON CONFLICT (code) DO NOTHING;
