
-- 1. ENUMS
DO $$ BEGIN CREATE TYPE public.tenant_status AS ENUM ('active','suspended','canceled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.tenant_member_role AS ENUM ('owner','admin','member'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','canceled','incomplete'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.billing_interval AS ENUM ('month','year'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE public.billing_invoice_status AS ENUM ('open','paid','void','uncollectible'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. TABELAS DE TENANT / BILLING
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status public.tenant_status NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tenants_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);
CREATE TRIGGER tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.tenant_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_in_tenant public.tenant_member_role NOT NULL DEFAULT 'member',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX idx_tenant_members_user ON public.tenant_members(user_id);
CREATE INDEX idx_tenant_members_tenant ON public.tenant_members(tenant_id);

CREATE TABLE public.tenant_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  host text NOT NULL UNIQUE,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.super_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  interval public.billing_interval NOT NULL DEFAULT 'month',
  trial_days integer NOT NULL DEFAULT 0,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER plans_updated_at BEFORE UPDATE ON public.plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'trialing',
  trial_end timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  canceled_at timestamptz,
  gateway text,
  gateway_customer_id text,
  gateway_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'BRL',
  status public.billing_invoice_status NOT NULL DEFAULT 'open',
  due_date date,
  paid_at timestamptz,
  gateway text,
  gateway_invoice_id text,
  hosted_invoice_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_billing_invoices_tenant ON public.billing_invoices(tenant_id);

-- 3. FUNÇÕES HELPER
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = _user_id) $$;

CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id AND user_id = _user_id AND is_active = true
  ) OR public.is_super_admin(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_setting text;
  v_uid uuid := auth.uid();
  v_tid uuid;
  v_count int;
BEGIN
  BEGIN
    v_setting := current_setting('app.current_tenant_id', true);
  EXCEPTION WHEN OTHERS THEN
    v_setting := NULL;
  END;
  IF v_setting IS NOT NULL AND v_setting <> '' THEN
    BEGIN
      RETURN v_setting::uuid;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_count FROM public.tenant_members WHERE user_id = v_uid AND is_active = true;
  IF v_count = 1 THEN
    SELECT tenant_id INTO v_tid FROM public.tenant_members WHERE user_id = v_uid AND is_active = true LIMIT 1;
    RETURN v_tid;
  END IF;
  RETURN NULL;
END $$;

-- 4. SEED
INSERT INTO public.plans (code, name, description, price_cents, currency, interval, trial_days, features, is_active, is_public, sort_order)
VALUES
  ('free', 'Free', 'Plano inicial com período de teste de 15 dias.', 0, 'BRL', 'month', 15, '{"max_users": 3}'::jsonb, true, true, 1),
  ('pro', 'Pro', 'Plano profissional com recursos completos.', 19900, 'BRL', 'month', 15, '{"max_users": 25}'::jsonb, true, true, 2);

INSERT INTO public.tenants (slug, name, status) VALUES ('bsstour', 'BSS Tour', 'active');

INSERT INTO public.tenant_members (tenant_id, user_id, role_in_tenant, is_active)
SELECT
  (SELECT id FROM public.tenants WHERE slug = 'bsstour'),
  u.id,
  CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role = 'admin') THEN 'owner'::public.tenant_member_role
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = u.id AND ur.role IN ('diretor','gerente')) THEN 'admin'::public.tenant_member_role
    ELSE 'member'::public.tenant_member_role
  END,
  true
FROM auth.users u;

INSERT INTO public.super_admins (user_id)
SELECT DISTINCT ur.user_id FROM public.user_roles ur WHERE ur.role = 'admin';

INSERT INTO public.subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
SELECT
  (SELECT id FROM public.tenants WHERE slug = 'bsstour'),
  (SELECT id FROM public.plans WHERE code = 'free'),
  'active', now(), now() + interval '100 years';

-- 5. tenant_id NAS TABELAS DE NEGÓCIO
DO $$
DECLARE
  t text;
  v_tid uuid;
  business_tables text[] := ARRAY[
    'bookings','booking_pax','booking_suppliers','booking_item_confirmations',
    'customers','leads','lead_alert_snoozes','interactions',
    'emails','email_threads','email_attachments','email_labels','email_message_links','email_sync_state',
    'suppliers','supplier_contacts','supplier_documents','supplier_rates',
    'quotes','quote_items','quote_flights','quote_documents','quote_item_notes',
    'vouchers','voucher_send_log',
    'packages','package_dates',
    'tasks','activity_log','operations_activities',
    'whatsapp_accounts','whatsapp_conversations','whatsapp_messages','whatsapp_templates',
    'notification_logs','notification_preferences','push_subscriptions',
    'itineraries','itinerary_chunks',
    'sla_settings','sla_escalations',
    'ai_conversations','ai_messages','ai_pending_actions','ai_generated_images',
    'user_email_accounts','user_gmail_tokens',
    'user_module_permissions','user_field_permissions',
    'invoices','exchange_rates'
  ];
BEGIN
  SELECT id INTO v_tid FROM public.tenants WHERE slug = 'bsstour';
  FOREACH t IN ARRAY business_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL', t, v_tid);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.current_tenant_id()', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_tenant ON public.%I(tenant_id)', t, t);
  END LOOP;
END $$;

-- 6. RLS NAS NOVAS TABELAS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated
  USING (public.is_tenant_member(id, auth.uid()));
CREATE POLICY tenants_admin_all ON public.tenants FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY tm_select ON public.tenant_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY tm_admin_all ON public.tenant_members FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.user_id = auth.uid()
      AND tm.role_in_tenant IN ('owner','admin') AND tm.is_active = true))
  WITH CHECK (public.is_super_admin(auth.uid()) OR EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = tenant_members.tenant_id AND tm.user_id = auth.uid()
      AND tm.role_in_tenant IN ('owner','admin') AND tm.is_active = true));

CREATE POLICY td_select ON public.tenant_domains FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY td_admin_all ON public.tenant_domains FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY sa_admin_all ON public.super_admins FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY plans_select ON public.plans FOR SELECT TO authenticated
  USING (is_public = true OR public.is_super_admin(auth.uid()));
CREATE POLICY plans_admin_all ON public.plans FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY sub_select ON public.subscriptions FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY sub_admin_all ON public.subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY bi_select ON public.billing_invoices FOR SELECT TO authenticated
  USING (public.is_tenant_member(tenant_id, auth.uid()));
CREATE POLICY bi_admin_all ON public.billing_invoices FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));

-- 7. RLS RESTRITIVO PARA ISOLAMENTO POR TENANT NAS TABELAS DE NEGÓCIO
DO $$
DECLARE
  t text;
  business_tables text[] := ARRAY[
    'bookings','booking_pax','booking_suppliers','booking_item_confirmations',
    'customers','leads','lead_alert_snoozes','interactions',
    'emails','email_threads','email_attachments','email_labels','email_message_links','email_sync_state',
    'suppliers','supplier_contacts','supplier_documents','supplier_rates',
    'quotes','quote_items','quote_flights','quote_documents','quote_item_notes',
    'vouchers','voucher_send_log',
    'packages','package_dates',
    'tasks','activity_log','operations_activities',
    'whatsapp_accounts','whatsapp_conversations','whatsapp_messages','whatsapp_templates',
    'notification_logs','notification_preferences','push_subscriptions',
    'itineraries','itinerary_chunks',
    'sla_settings','sla_escalations',
    'ai_conversations','ai_messages','ai_pending_actions','ai_generated_images',
    'user_email_accounts','user_gmail_tokens',
    'user_module_permissions','user_field_permissions',
    'invoices','exchange_rates'
  ];
BEGIN
  FOREACH t IN ARRAY business_tables LOOP
    EXECUTE format('
      CREATE POLICY tenant_isolation_%I ON public.%I
      AS RESTRICTIVE FOR ALL TO authenticated
      USING (
        public.is_super_admin(auth.uid())
        OR tenant_id = public.current_tenant_id()
        OR (public.current_tenant_id() IS NULL AND public.is_tenant_member(tenant_id, auth.uid()))
      )
      WITH CHECK (
        public.is_super_admin(auth.uid())
        OR tenant_id = public.current_tenant_id()
        OR (public.current_tenant_id() IS NULL AND public.is_tenant_member(tenant_id, auth.uid()))
      )
    ', t, t);
  END LOOP;
END $$;
