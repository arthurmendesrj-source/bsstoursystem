ALTER TABLE public.activity_log DROP CONSTRAINT IF EXISTS activity_log_entity_type_check;
ALTER TABLE public.activity_log ADD CONSTRAINT activity_log_entity_type_check
  CHECK (entity_type = ANY (ARRAY['lead','quote','booking','invoice','customer','supplier']));