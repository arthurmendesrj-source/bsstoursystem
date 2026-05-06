
CREATE OR REPLACE VIEW public.v_supplier_rates_validation AS
WITH base AS (
  SELECT id, supplier_id, service_name, city, category, pax_min, pax_max, language, unit, unit_price, city_id, service_id, category_id
  FROM public.supplier_rates
)
SELECT
  supplier_id,
  count(*) AS total,
  count(*) FILTER (WHERE unit_price IS NULL OR unit_price <= 0) AS zero_price,
  count(*) FILTER (WHERE service_name IS NULL OR btrim(service_name)='') AS empty_service,
  count(*) FILTER (WHERE city IS NULL OR btrim(city)='') AS empty_city,
  count(*) FILTER (WHERE city_id IS NULL AND city IS NOT NULL) AS unmapped_city,
  count(*) FILTER (WHERE service_id IS NULL AND service_name IS NOT NULL) AS unmapped_service,
  count(*) FILTER (WHERE category_id IS NULL) AS unmapped_category,
  count(*) FILTER (WHERE pax_min IS NOT NULL AND pax_max IS NOT NULL AND pax_min > pax_max) AS pax_invalid,
  count(*) FILTER (WHERE pax_min IS NOT NULL AND pax_min > 50) AS suspicious_pax_min,
  count(*) FILTER (WHERE category IS NOT NULL AND length(category) > 80) AS suspicious_long_category
FROM base
GROUP BY supplier_id;

CREATE OR REPLACE VIEW public.v_supplier_rates_duplicates AS
SELECT
  supplier_id,
  service_name, city, category, pax_min, pax_max, language, unit,
  count(*) AS occurrences,
  array_agg(id) AS rate_ids,
  array_agg(DISTINCT unit_price) AS prices
FROM public.supplier_rates
GROUP BY 1,2,3,4,5,6,7,8
HAVING count(*) > 1;

CREATE OR REPLACE VIEW public.v_supplier_rates_issues AS
SELECT
  id, supplier_id, service_name, city, category, pax_min, pax_max, unit_price, currency,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN unit_price IS NULL OR unit_price <= 0 THEN 'zero_price' END,
    CASE WHEN service_name IS NULL OR btrim(service_name)='' THEN 'empty_service' END,
    CASE WHEN city IS NULL OR btrim(city)='' THEN 'empty_city' END,
    CASE WHEN city_id IS NULL AND city IS NOT NULL THEN 'unmapped_city' END,
    CASE WHEN service_id IS NULL AND service_name IS NOT NULL THEN 'unmapped_service' END,
    CASE WHEN category_id IS NULL THEN 'unmapped_category' END,
    CASE WHEN pax_min IS NOT NULL AND pax_max IS NOT NULL AND pax_min > pax_max THEN 'pax_invalid' END,
    CASE WHEN pax_min IS NOT NULL AND pax_min > 50 THEN 'suspicious_pax_min' END,
    CASE WHEN category IS NOT NULL AND length(category) > 80 THEN 'suspicious_long_category' END
  ], NULL) AS issues
FROM public.supplier_rates
WHERE
  unit_price IS NULL OR unit_price <= 0
  OR service_name IS NULL OR btrim(service_name)=''
  OR city IS NULL OR btrim(city)=''
  OR (city_id IS NULL AND city IS NOT NULL)
  OR (service_id IS NULL AND service_name IS NOT NULL)
  OR category_id IS NULL
  OR (pax_min IS NOT NULL AND pax_max IS NOT NULL AND pax_min > pax_max)
  OR (pax_min IS NOT NULL AND pax_min > 50)
  OR (category IS NOT NULL AND length(category) > 80);
