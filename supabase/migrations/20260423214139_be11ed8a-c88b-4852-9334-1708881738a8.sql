-- Add code columns
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS code text UNIQUE;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS code text UNIQUE;
ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS code text UNIQUE;

-- Helper: extract initials from a full name (first letter of first 2 words, uppercase)
CREATE OR REPLACE FUNCTION public.extract_initials(_full_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  parts text[];
  initials text := '';
  i int;
BEGIN
  IF _full_name IS NULL OR length(trim(_full_name)) = 0 THEN
    RETURN 'XX';
  END IF;
  parts := regexp_split_to_array(trim(_full_name), '\s+');
  FOR i IN 1..least(2, array_length(parts, 1)) LOOP
    IF length(parts[i]) > 0 THEN
      initials := initials || upper(substring(parts[i] from 1 for 1));
    END IF;
  END LOOP;
  IF length(initials) = 1 THEN
    initials := initials || 'X';
  ELSIF length(initials) = 0 THEN
    initials := 'XX';
  END IF;
  RETURN initials;
END;
$$;

-- Generate entity code: INITIALS + 2-digit seq (per operator+month+entity) + MMYY
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
      WHERE created_by = _user_id AND created_at >= month_start AND created_at < month_end;
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

  -- Avoid collision (e.g. concurrent inserts): bump seq until unique
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

-- Trigger functions
CREATE OR REPLACE FUNCTION public.set_lead_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := public.generate_entity_code('lead', COALESCE(NEW.created_by, auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_customer_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := public.generate_entity_code('customer', COALESCE(NEW.created_by, auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_supplier_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := public.generate_entity_code('supplier', COALESCE(NEW.created_by, auth.uid()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lead_code ON public.leads;
CREATE TRIGGER trg_set_lead_code BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.set_lead_code();

DROP TRIGGER IF EXISTS trg_set_customer_code ON public.customers;
CREATE TRIGGER trg_set_customer_code BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_customer_code();

DROP TRIGGER IF EXISTS trg_set_supplier_code ON public.suppliers;
CREATE TRIGGER trg_set_supplier_code BEFORE INSERT ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.set_supplier_code();