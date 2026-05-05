
-- Extensões
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- URL base + apikey usada pelos triggers/cron para chamar o endpoint público
-- (ajuste em produção se necessário)
CREATE OR REPLACE FUNCTION public._notify_endpoint_url()
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'https://project--e04e61e2-142f-4f0a-97f1-8cfe086322f3.lovable.app'::text;
$$;

CREATE OR REPLACE FUNCTION public._notify_apikey()
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cnBzZ3hxY3J6Z2FncHd6YmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NjIyNTksImV4cCI6MjA5MjUzODI1OX0.IR6bw8pyKI7gZuWlz9d2Rp7ZLuK_w3Dui5nEzSR29K4'::text;
$$;

-- Trigger: eventos de lead (assigned / status changed)
CREATE OR REPLACE FUNCTION public.on_lead_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      v_event := 'lead_assigned';
      v_payload := jsonb_build_object(
        'event', v_event,
        'leadId', NEW.id,
        'leadName', NEW.name,
        'assignedTo', NEW.assigned_to,
        'actorId', NEW.created_by
      );
      PERFORM net.http_post(
        url := public._notify_endpoint_url() || '/api/public/hooks/lead-events',
        headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey()),
        body := v_payload
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      v_payload := jsonb_build_object(
        'event','lead_assigned',
        'leadId', NEW.id,
        'leadName', NEW.name,
        'assignedTo', NEW.assigned_to,
        'actorId', auth.uid()
      );
      PERFORM net.http_post(
        url := public._notify_endpoint_url() || '/api/public/hooks/lead-events',
        headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey()),
        body := v_payload
      );
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_payload := jsonb_build_object(
        'event','lead_status_changed',
        'leadId', NEW.id,
        'leadName', NEW.name,
        'oldStatus', OLD.status,
        'newStatus', NEW.status,
        'actorId', auth.uid()
      );
      PERFORM net.http_post(
        url := public._notify_endpoint_url() || '/api/public/hooks/lead-events',
        headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey()),
        body := v_payload
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_events_ins ON public.leads;
CREATE TRIGGER trg_lead_events_ins
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.on_lead_event();

DROP TRIGGER IF EXISTS trg_lead_events_upd ON public.leads;
CREATE TRIGGER trg_lead_events_upd
  AFTER UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.on_lead_event();

-- Cron: a cada 5min dispara endpoint que checa tarefas vencendo
SELECT cron.unschedule('notify-task-due') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-task-due');

SELECT cron.schedule(
  'notify-task-due',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := public._notify_endpoint_url() || '/api/public/hooks/task-due',
    headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey()),
    body := '{}'::jsonb
  );
  $cron$
);
