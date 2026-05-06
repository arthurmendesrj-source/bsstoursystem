
CREATE OR REPLACE FUNCTION public.slugify(_t text) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path=public AS $$
  SELECT regexp_replace(
    regexp_replace(lower(coalesce(_t,'')), '[^a-z0-9]+','-','g'),
    '(^-+|-+$)','','g')
$$;
