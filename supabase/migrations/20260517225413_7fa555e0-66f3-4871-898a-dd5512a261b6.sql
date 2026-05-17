
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_product_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id   text,
  ADD COLUMN IF NOT EXISTS included_users    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_user_cents  int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_extra_user_price_id text,
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS features          jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_quote          boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS public.plan_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_cents int NOT NULL,
  currency text DEFAULT 'BRL',
  interval text DEFAULT 'month',
  category text,
  metadata jsonb DEFAULT '{}'::jsonb,
  stripe_product_id text,
  stripe_price_id text,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.plan_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addons readable by anyone" ON public.plan_addons FOR SELECT USING (true);
CREATE POLICY "addons write super admin" ON public.plan_addons FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER plan_addons_updated_at BEFORE UPDATE ON public.plan_addons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.plan_one_time (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_cents int,
  price_min_cents int,
  price_max_cents int,
  currency text DEFAULT 'BRL',
  category text,
  payment_split jsonb DEFAULT '{"upfront_pct":50,"on_delivery_pct":50}'::jsonb,
  stripe_product_id text,
  stripe_price_id text,
  is_active boolean DEFAULT true,
  is_quote boolean DEFAULT false,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.plan_one_time ENABLE ROW LEVEL SECURITY;
CREATE POLICY "one_time readable by anyone" ON public.plan_one_time FOR SELECT USING (true);
CREATE POLICY "one_time write super admin" ON public.plan_one_time FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
CREATE TRIGGER plan_one_time_updated_at BEFORE UPDATE ON public.plan_one_time
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.subscription_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES public.plan_addons(id),
  quantity int DEFAULT 1,
  stripe_subscription_item_id text,
  added_at timestamptz DEFAULT now()
);
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub addons readable by tenant member" ON public.subscription_addons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND public.is_tenant_member(s.tenant_id, auth.uid())
  ));
CREATE POLICY "sub addons write super admin" ON public.subscription_addons FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
