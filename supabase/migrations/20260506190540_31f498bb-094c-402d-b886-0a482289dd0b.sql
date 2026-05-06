
CREATE OR REPLACE FUNCTION public.generate_entity_code(_entity text, _user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  initials text;
  full_name text;
  mmyy text;
  month_start timestamptz;
  month_end timestamptz;
  seq int;
  new_code text;
BEGIN
  SELECT p.full_name INTO full_name FROM public.profiles p WHERE p.user_id = _user_id LIMIT 1;
  initials := public.extract_initials(full_name);
  mmyy := to_char(now(), 'MMYY');
  month_start := date_trunc('month', now());
  month_end := month_start + interval '1 month';

  IF _entity = 'lead' THEN
    SELECT count(*) + 1 INTO seq FROM public.leads
      WHERE COALESCE(assigned_to, created_by) = _user_id
        AND created_at >= month_start AND created_at < month_end;
  ELSIF _entity = 'customer' THEN
    SELECT count(*) + 1 INTO seq FROM public.customers
      WHERE created_by = _user_id AND created_at >= month_start AND created_at < month_end;
  ELSIF _entity = 'supplier' THEN
    SELECT count(*) + 1 INTO seq FROM public.suppliers
      WHERE created_by = _user_id AND created_at >= month_start AND created_at < month_end;
  ELSE
    seq := 1;
  END IF;

  new_code := initials || lpad(seq::text, 2, '0') || mmyy;

  WHILE EXISTS (
    SELECT 1 FROM public.leads WHERE code = new_code
    UNION ALL SELECT 1 FROM public.customers WHERE code = new_code
    UNION ALL SELECT 1 FROM public.suppliers WHERE code = new_code
  ) LOOP
    seq := seq + 1;
    new_code := initials || lpad(seq::text, 2, '0') || mmyy;
  END LOOP;

  RETURN new_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_lead_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := public.generate_entity_code(
      'lead',
      COALESCE(NEW.assigned_to, NEW.created_by, auth.uid())
    );
  END IF;
  RETURN NEW;
END;
$$;
