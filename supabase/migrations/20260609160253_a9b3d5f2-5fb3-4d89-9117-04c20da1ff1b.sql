
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'suspended';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS grace_until timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_sub_period_uidx
  ON public.billing_invoices (subscription_id, period_start)
  WHERE kind = 'subscription' AND subscription_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_tenant_billing_blocked(_tenant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_grace timestamptz;
BEGIN
  SELECT status::text, grace_until INTO v_status, v_grace
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

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_tenant_billing_blocked(uuid) TO authenticated, service_role;
