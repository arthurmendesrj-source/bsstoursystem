
-- 1. Move pg_net out of public schema (must drop + recreate; SET SCHEMA unsupported)
CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO postgres, service_role;
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net WITH SCHEMA extensions;

-- 2. Recreate on_lead_event using extensions.http_post
CREATE OR REPLACE FUNCTION public.on_lead_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, extensions
AS $function$
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
      PERFORM extensions.http_post(
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
      PERFORM extensions.http_post(
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
      PERFORM extensions.http_post(
        url := public._notify_endpoint_url() || '/api/public/hooks/lead-events',
        headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey()),
        body := v_payload
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Fix mutable search_path on notify helpers
CREATE OR REPLACE FUNCTION public._notify_endpoint_url()
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT 'https://project--e04e61e2-142f-4f0a-97f1-8cfe086322f3.lovable.app'::text; $$;

CREATE OR REPLACE FUNCTION public._notify_apikey()
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh5cnBzZ3hxY3J6Z2FncHd6YmtlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NjIyNTksImV4cCI6MjA5MjUzODI1OX0.IR6bw8pyKI7gZuWlz9d2Rp7ZLuK_w3Dui5nEzSR29K4'::text; $$;

-- 4. Revoke EXECUTE from public/anon/authenticated on all SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_entity_code(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_activity() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.on_lead_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_customer_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_lead_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_supplier_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._notify_apikey() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._notify_endpoint_url() FROM PUBLIC, anon, authenticated;

-- 5. Grant EXECUTE back ONLY to role-check helpers used by RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_lead(uuid, uuid) TO authenticated;
