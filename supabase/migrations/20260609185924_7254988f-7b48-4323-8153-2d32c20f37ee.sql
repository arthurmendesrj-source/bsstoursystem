
-- 1. Ensure Free plan has 30-day trial; other plans have 0
UPDATE public.plans SET trial_days = 30 WHERE code = 'free';
UPDATE public.plans SET trial_days = 0 WHERE code <> 'free';

-- 2. Trigger to auto-create a 30-day trialing subscription on new tenant
CREATE OR REPLACE FUNCTION public.create_trial_subscription_for_tenant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_trial_days int;
BEGIN
  -- Skip if a subscription already exists for this tenant
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE tenant_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT id, COALESCE(trial_days, 30) INTO v_plan_id, v_trial_days
    FROM public.plans
   WHERE code = 'free'
   LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.subscriptions (
    tenant_id, plan_id, status, trial_end,
    current_period_start, current_period_end
  )
  VALUES (
    NEW.id, v_plan_id, 'trialing', now() + (v_trial_days || ' days')::interval,
    now(), now() + (v_trial_days || ' days')::interval
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_trial_subscription ON public.tenants;
CREATE TRIGGER trg_create_trial_subscription
AFTER INSERT ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.create_trial_subscription_for_tenant();

-- 3. Update billing-blocked function to also block expired trials
CREATE OR REPLACE FUNCTION public.is_tenant_billing_blocked(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_grace timestamptz;
  v_trial_end timestamptz;
BEGIN
  SELECT status::text, grace_until, trial_end
    INTO v_status, v_grace, v_trial_end
    FROM public.subscriptions
   WHERE tenant_id = _tenant_id
   ORDER BY created_at DESC NULLS LAST
   LIMIT 1;

  IF v_status IS NULL THEN
    RETURN false;
  END IF;

  IF v_status IN ('suspended','canceled') THEN
    RETURN true;
  END IF;

  IF v_status = 'past_due' AND COALESCE(v_grace, now()) < now() THEN
    RETURN true;
  END IF;

  -- Expired trial without conversion blocks access
  IF v_status = 'trialing' AND v_trial_end IS NOT NULL AND v_trial_end < now() THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- 4. Backfill trial subscriptions for existing tenants without one
INSERT INTO public.subscriptions (tenant_id, plan_id, status, trial_end, current_period_start, current_period_end)
SELECT t.id,
       (SELECT id FROM public.plans WHERE code='free' LIMIT 1),
       'trialing',
       COALESCE(t.created_at, now()) + interval '30 days',
       COALESCE(t.created_at, now()),
       COALESCE(t.created_at, now()) + interval '30 days'
  FROM public.tenants t
 WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.tenant_id = t.id)
   AND EXISTS (SELECT 1 FROM public.plans WHERE code='free');
