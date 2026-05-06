DO $$
DECLARE
  r RECORD;
  initials text;
  mmyy text := to_char(now(), 'MMYY');
  max_seq int;
  new_code text;
  seq int;
  seq_str text;
BEGIN
  FOR r IN
    SELECT s.id, s.created_by, p.full_name
    FROM public.suppliers s
    JOIN public.profiles p ON p.user_id = s.created_by
    WHERE s.code IS NULL OR s.code = ''
    ORDER BY s.created_at, s.id
  LOOP
    initials := public.extract_initials(r.full_name);
    SELECT COALESCE(MAX((regexp_replace(code, '^' || initials || '(\d+)' || mmyy || '$', '\1'))::int), 0)
    INTO max_seq
    FROM (
      SELECT code FROM public.suppliers WHERE code ~ ('^' || initials || '\d+' || mmyy || '$')
      UNION ALL SELECT code FROM public.customers WHERE code ~ ('^' || initials || '\d+' || mmyy || '$')
      UNION ALL SELECT code FROM public.leads WHERE code ~ ('^' || initials || '\d+' || mmyy || '$')
    ) t;
    seq := max_seq + 1;
    seq_str := CASE WHEN seq < 100 THEN lpad(seq::text, 2, '0') ELSE seq::text END;
    new_code := initials || seq_str || mmyy;
    UPDATE public.suppliers SET code = new_code WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.suppliers ENABLE TRIGGER trg_set_supplier_code;