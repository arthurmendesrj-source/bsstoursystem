CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION public.slugify_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $$
  SELECT regexp_replace(
    regexp_replace(
      lower(public.unaccent(coalesce(input, ''))),
      '[^a-z0-9]+', '-', 'g'
    ),
    '(^-+|-+$)', '', 'g'
  );
$$;

CREATE UNIQUE INDEX IF NOT EXISTS ref_cities_country_slug_uniq
  ON public.ref_cities ((coalesce(country, '')), slug);
CREATE UNIQUE INDEX IF NOT EXISTS ref_service_categories_kind_slug_uniq
  ON public.ref_service_categories (kind, slug);
CREATE UNIQUE INDEX IF NOT EXISTS ref_services_category_slug_uniq
  ON public.ref_services ((coalesce(category_id::text, '')), slug);

CREATE OR REPLACE FUNCTION public.resolve_supplier_rate_refs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_city_slug text;
  v_cat_slug text;
  v_svc_slug text;
  v_kind text;
BEGIN
  IF NEW.city_id IS NULL AND NEW.city IS NOT NULL AND length(trim(NEW.city)) > 0 THEN
    v_city_slug := public.slugify_text(NEW.city);
    IF v_city_slug <> '' THEN
      SELECT id INTO NEW.city_id
      FROM public.ref_cities
      WHERE slug = v_city_slug AND coalesce(country, '') = ''
      LIMIT 1;
      IF NEW.city_id IS NULL THEN
        INSERT INTO public.ref_cities (name, slug, country)
        VALUES (NEW.city, v_city_slug, NULL)
        ON CONFLICT ((coalesce(country, '')), slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO NEW.city_id;
      END IF;
    END IF;
  END IF;

  v_kind := lower(coalesce(NEW.service_type, 'outro'));
  IF v_kind NOT IN ('transfer','tour','hotel','restaurant','outro') THEN
    v_kind := 'outro';
  END IF;

  IF NEW.category_id IS NULL AND NEW.category IS NOT NULL AND length(trim(NEW.category)) > 0 THEN
    v_cat_slug := public.slugify_text(NEW.category);
    IF v_cat_slug <> '' THEN
      SELECT id INTO NEW.category_id
      FROM public.ref_service_categories
      WHERE kind = v_kind AND slug = v_cat_slug
      LIMIT 1;
      IF NEW.category_id IS NULL THEN
        INSERT INTO public.ref_service_categories (name, slug, kind)
        VALUES (NEW.category, v_cat_slug, v_kind)
        ON CONFLICT (kind, slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO NEW.category_id;
      END IF;
    END IF;
  END IF;

  IF NEW.service_id IS NULL AND NEW.service_name IS NOT NULL AND length(trim(NEW.service_name)) > 0 THEN
    v_svc_slug := public.slugify_text(NEW.service_name);
    IF v_svc_slug <> '' THEN
      SELECT id INTO NEW.service_id
      FROM public.ref_services
      WHERE slug = v_svc_slug
        AND coalesce(category_id::text, '') = coalesce(NEW.category_id::text, '')
      LIMIT 1;
      IF NEW.service_id IS NULL THEN
        INSERT INTO public.ref_services (name, slug, category_id)
        VALUES (NEW.service_name, v_svc_slug, NEW.category_id)
        ON CONFLICT ((coalesce(category_id::text, '')), slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO NEW.service_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_supplier_rate_refs ON public.supplier_rates;
CREATE TRIGGER trg_resolve_supplier_rate_refs
BEFORE INSERT OR UPDATE ON public.supplier_rates
FOR EACH ROW
EXECUTE FUNCTION public.resolve_supplier_rate_refs();