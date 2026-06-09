
-- Helper: is_tenant_owner
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_tenant_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants WHERE id = _tenant_id AND created_by = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = _user_id
      AND role_in_tenant = 'owner' AND is_active = true
  ) OR public.is_super_admin(_user_id);
$$;

-- Extend billing_invoices
ALTER TABLE public.billing_invoices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'subscription' CHECK (kind IN ('subscription','topup')),
  ADD COLUMN IF NOT EXISTS period_start timestamptz,
  ADD COLUMN IF NOT EXISTS period_end timestamptz,
  ADD COLUMN IF NOT EXISTS payment_method text CHECK (payment_method IN ('card','pix','boleto')),
  ADD COLUMN IF NOT EXISTS pix_qr text,
  ADD COLUMN IF NOT EXISTS pix_copia_cola text,
  ADD COLUMN IF NOT EXISTS boleto_url text,
  ADD COLUMN IF NOT EXISTS infinitepay_charge_id text,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_infinitepay_charge_id_uq
  ON public.billing_invoices(infinitepay_charge_id) WHERE infinitepay_charge_id IS NOT NULL;

-- billing_customers
CREATE TABLE IF NOT EXISTS public.billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('cpf','cnpj')),
  doc_number text NOT NULL,
  email text NOT NULL,
  phone text,
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  infinitepay_customer_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_customers TO authenticated;
GRANT ALL ON public.billing_customers TO service_role;
ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages billing_customers" ON public.billing_customers
  FOR ALL USING (public.is_tenant_owner(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_owner(tenant_id, auth.uid()));
CREATE TRIGGER trg_billing_customers_updated BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- billing_payment_methods (tokenized cards only)
CREATE TABLE IF NOT EXISTS public.billing_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  infinitepay_card_token text NOT NULL,
  brand text,
  last4 text,
  exp_month smallint,
  exp_year smallint,
  holder_name text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_payment_methods TO authenticated;
GRANT ALL ON public.billing_payment_methods TO service_role;
ALTER TABLE public.billing_payment_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages payment_methods" ON public.billing_payment_methods
  FOR ALL USING (public.is_tenant_owner(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_owner(tenant_id, auth.uid()));
CREATE UNIQUE INDEX IF NOT EXISTS billing_pm_default_per_tenant
  ON public.billing_payment_methods(tenant_id) WHERE is_default = true;

-- billing_credit_wallet
CREATE TABLE IF NOT EXISTS public.billing_credit_wallet (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  ai_credits bigint NOT NULL DEFAULT 0,
  storage_gb_extra numeric(12,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_credit_wallet TO authenticated;
GRANT ALL ON public.billing_credit_wallet TO service_role;
ALTER TABLE public.billing_credit_wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads wallet" ON public.billing_credit_wallet
  FOR SELECT USING (public.is_tenant_owner(tenant_id, auth.uid()));

-- billing_credit_ledger
CREATE TABLE IF NOT EXISTS public.billing_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('grant','consume','topup','expire','refund','adjust')),
  resource text NOT NULL CHECK (resource IN ('ai_credits','storage_gb')),
  amount numeric(14,3) NOT NULL,
  balance_after numeric(14,3) NOT NULL,
  reference_type text,
  reference_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.billing_credit_ledger TO authenticated;
GRANT ALL ON public.billing_credit_ledger TO service_role;
ALTER TABLE public.billing_credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads ledger" ON public.billing_credit_ledger
  FOR SELECT USING (public.is_tenant_owner(tenant_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_credit_ledger_tenant_created ON public.billing_credit_ledger(tenant_id, created_at DESC);

-- usage_ai_events
CREATE TABLE IF NOT EXISTS public.usage_ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer GENERATED ALWAYS AS (prompt_tokens + completion_tokens) STORED,
  credits_charged numeric(14,3) NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.usage_ai_events TO authenticated;
GRANT ALL ON public.usage_ai_events TO service_role;
ALTER TABLE public.usage_ai_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads ai events" ON public.usage_ai_events
  FOR SELECT USING (public.is_tenant_owner(tenant_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_ai_events_tenant_created ON public.usage_ai_events(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_events_tenant_feature ON public.usage_ai_events(tenant_id, feature, created_at DESC);

-- usage_storage_daily
CREATE TABLE IF NOT EXISTS public.usage_storage_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bucket text NOT NULL,
  bytes bigint NOT NULL DEFAULT 0,
  file_count integer NOT NULL DEFAULT 0,
  snapshot_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, bucket, snapshot_date)
);
GRANT SELECT, INSERT, UPDATE ON public.usage_storage_daily TO authenticated;
GRANT ALL ON public.usage_storage_daily TO service_role;
ALTER TABLE public.usage_storage_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads storage usage" ON public.usage_storage_daily
  FOR SELECT USING (public.is_tenant_owner(tenant_id, auth.uid()));
CREATE INDEX IF NOT EXISTS idx_storage_daily_tenant_date ON public.usage_storage_daily(tenant_id, snapshot_date DESC);

-- billing_topups
CREATE TABLE IF NOT EXISTS public.billing_topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (resource IN ('ai_credits','storage_gb')),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  payment_method text NOT NULL CHECK (payment_method IN ('card','pix','boleto')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','expired','refunded')),
  invoice_id uuid REFERENCES public.billing_invoices(id) ON DELETE SET NULL,
  infinitepay_charge_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.billing_topups TO authenticated;
GRANT ALL ON public.billing_topups TO service_role;
ALTER TABLE public.billing_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner manages topups" ON public.billing_topups
  FOR ALL USING (public.is_tenant_owner(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_owner(tenant_id, auth.uid()));
CREATE TRIGGER trg_billing_topups_updated BEFORE UPDATE ON public.billing_topups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
