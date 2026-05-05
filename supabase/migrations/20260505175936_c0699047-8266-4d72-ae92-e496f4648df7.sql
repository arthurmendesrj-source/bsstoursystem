CREATE OR REPLACE FUNCTION public.on_lead_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.assigned_to IS NOT NULL THEN
      v_payload := jsonb_build_object(
        'event','lead_assigned',
        'leadId', NEW.id, 'leadName', NEW.name,
        'assignedTo', NEW.assigned_to, 'actorId', NEW.created_by
      );
      PERFORM net.http_post(
        url := public._notify_endpoint_url() || '/api/public/hooks/lead-events',
        body := v_payload,
        headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey())
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.assigned_to IS DISTINCT FROM OLD.assigned_to AND NEW.assigned_to IS NOT NULL THEN
      v_payload := jsonb_build_object(
        'event','lead_assigned',
        'leadId', NEW.id, 'leadName', NEW.name,
        'assignedTo', NEW.assigned_to, 'actorId', auth.uid()
      );
      PERFORM net.http_post(
        url := public._notify_endpoint_url() || '/api/public/hooks/lead-events',
        body := v_payload,
        headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey())
      );
    END IF;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      v_payload := jsonb_build_object(
        'event','lead_status_changed',
        'leadId', NEW.id, 'leadName', NEW.name,
        'oldStatus', OLD.status, 'newStatus', NEW.status,
        'actorId', auth.uid()
      );
      PERFORM net.http_post(
        url := public._notify_endpoint_url() || '/api/public/hooks/lead-events',
        body := v_payload,
        headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey())
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;