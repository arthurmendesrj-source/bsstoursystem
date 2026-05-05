-- Function: create task from new email
CREATE OR REPLACE FUNCTION public.create_task_from_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned uuid;
  v_category text;
  v_title text;
BEGIN
  -- Avoid duplicates
  IF EXISTS (SELECT 1 FROM public.tasks WHERE email_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    SELECT assigned_to INTO v_assigned FROM public.leads WHERE id = NEW.lead_id;
    v_category := 'negocio';
  ELSE
    v_category := 'suporte';
  END IF;

  v_title := COALESCE(NULLIF(NEW.subject, ''), 'Email recebido');

  INSERT INTO public.tasks (
    title, description, category, priority, source,
    email_id, lead_id, customer_id, supplier_id,
    assigned_to, created_by
  ) VALUES (
    v_title,
    LEFT(COALESCE(NEW.snippet, ''), 500),
    v_category,
    'media',
    'email',
    NEW.id,
    NEW.lead_id,
    NEW.customer_id,
    NEW.supplier_id,
    v_assigned,
    COALESCE(v_assigned, auth.uid())
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_create_task ON public.emails;
CREATE TRIGGER trg_email_create_task
AFTER INSERT ON public.emails
FOR EACH ROW EXECUTE FUNCTION public.create_task_from_email();

-- Function: sync task link when email is updated (linked later to lead/customer)
CREATE OR REPLACE FUNCTION public.sync_task_from_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assigned uuid;
  v_category text;
BEGIN
  IF NEW.lead_id IS DISTINCT FROM OLD.lead_id
     OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
     OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN

    IF NEW.lead_id IS NOT NULL THEN
      SELECT assigned_to INTO v_assigned FROM public.leads WHERE id = NEW.lead_id;
      v_category := 'negocio';
    ELSE
      v_category := 'suporte';
    END IF;

    UPDATE public.tasks
    SET lead_id = NEW.lead_id,
        customer_id = NEW.customer_id,
        supplier_id = NEW.supplier_id,
        category = v_category,
        assigned_to = COALESCE(assigned_to, v_assigned),
        updated_at = now()
    WHERE email_id = NEW.id AND completed = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_sync_task_link ON public.emails;
CREATE TRIGGER trg_email_sync_task_link
AFTER UPDATE ON public.emails
FOR EACH ROW EXECUTE FUNCTION public.sync_task_from_email();

-- Backfill existing emails without tasks
INSERT INTO public.tasks (
  title, description, category, priority, source,
  email_id, lead_id, customer_id, supplier_id, assigned_to, created_by
)
SELECT
  COALESCE(NULLIF(e.subject, ''), 'Email recebido'),
  LEFT(COALESCE(e.snippet, ''), 500),
  CASE WHEN e.lead_id IS NOT NULL THEN 'negocio' ELSE 'suporte' END,
  'media',
  'email',
  e.id,
  e.lead_id,
  e.customer_id,
  e.supplier_id,
  l.assigned_to,
  COALESCE(l.assigned_to, l.created_by)
FROM public.emails e
LEFT JOIN public.leads l ON l.id = e.lead_id
WHERE NOT EXISTS (SELECT 1 FROM public.tasks t WHERE t.email_id = e.id);