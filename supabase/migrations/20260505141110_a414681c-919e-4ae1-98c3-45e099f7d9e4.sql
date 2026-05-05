-- activity_log table
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('lead','quote','booking')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('created','updated','status_changed')),
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_log_entity ON public.activity_log (entity_type, entity_id, created_at DESC);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read activity_log"
ON public.activity_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins delete activity_log"
ON public.activity_log FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- Generic logger
CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity text := TG_ARGV[0];
  v_fields text[] := TG_ARGV[1]::text[];
  v_changes jsonb := '{}'::jsonb;
  v_action text;
  f text;
  old_v jsonb;
  new_v jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log(entity_type, entity_id, action, changes, actor_id)
    VALUES (v_entity, NEW.id, 'created', '{}'::jsonb, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    FOREACH f IN ARRAY v_fields LOOP
      EXECUTE format('SELECT to_jsonb($1.%I), to_jsonb($2.%I)', f, f) INTO old_v, new_v USING OLD, NEW;
      IF old_v IS DISTINCT FROM new_v THEN
        v_changes := v_changes || jsonb_build_object(f, jsonb_build_object('old', old_v, 'new', new_v));
      END IF;
    END LOOP;
    IF v_changes = '{}'::jsonb THEN
      RETURN NEW;
    END IF;
    v_action := CASE WHEN v_changes ? 'status' THEN 'status_changed' ELSE 'updated' END;
    INSERT INTO public.activity_log(entity_type, entity_id, action, changes, actor_id)
    VALUES (v_entity, NEW.id, v_action, v_changes, auth.uid());
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

-- Triggers
CREATE TRIGGER trg_log_leads
AFTER INSERT OR UPDATE ON public.leads
FOR EACH ROW EXECUTE FUNCTION public.log_activity('lead', '{status,assigned_to,next_action,next_action_date,expected_travel_date,estimated_value,destination,customer_id}');

CREATE TRIGGER trg_log_quotes
AFTER INSERT OR UPDATE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.log_activity('quote', '{status,total_amount,currency,valid_until,discount,customer_id,lead_id,package_id}');

CREATE TRIGGER trg_log_bookings
AFTER INSERT OR UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.log_activity('booking', '{status,total_amount,currency,departure_date,return_date,customer_id,supplier_id,quote_id,package_id,package_date_id}');