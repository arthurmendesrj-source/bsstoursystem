-- Index for fast thread lookup of already-linked emails
CREATE INDEX IF NOT EXISTS idx_emails_thread_linked
  ON public.emails (thread_id)
  WHERE lead_id IS NOT NULL OR customer_id IS NOT NULL OR supplier_id IS NOT NULL;

-- Trigger: copy lead/customer/supplier from another email in the same thread
CREATE OR REPLACE FUNCTION public.auto_link_email_by_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.thread_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.lead_id IS NOT NULL OR NEW.customer_id IS NOT NULL OR NEW.supplier_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT lead_id, customer_id, supplier_id INTO r
  FROM public.emails
  WHERE thread_id = NEW.thread_id
    AND (lead_id IS NOT NULL OR customer_id IS NOT NULL OR supplier_id IS NOT NULL)
  LIMIT 1;
  IF FOUND THEN
    NEW.lead_id := COALESCE(NEW.lead_id, r.lead_id);
    NEW.customer_id := COALESCE(NEW.customer_id, r.customer_id);
    NEW.supplier_id := COALESCE(NEW.supplier_id, r.supplier_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS emails_auto_link ON public.emails;
CREATE TRIGGER emails_auto_link
BEFORE INSERT ON public.emails
FOR EACH ROW EXECUTE FUNCTION public.auto_link_email_by_thread();

-- Helper RPC: link a whole thread to a lead/customer/supplier
-- and record entries in email_message_links for traceability.
CREATE OR REPLACE FUNCTION public.link_email_thread(
  _thread_id text,
  _lead_id uuid DEFAULT NULL,
  _customer_id uuid DEFAULT NULL,
  _supplier_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_actor uuid := auth.uid();
BEGIN
  IF _thread_id IS NULL OR length(_thread_id) = 0 THEN
    RETURN 0;
  END IF;
  IF _lead_id IS NULL AND _customer_id IS NULL AND _supplier_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.emails
    SET lead_id = COALESCE(lead_id, _lead_id),
        customer_id = COALESCE(customer_id, _customer_id),
        supplier_id = COALESCE(supplier_id, _supplier_id)
    WHERE thread_id = _thread_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Mirror to email_message_links (one row per gmail message in the thread).
  INSERT INTO public.email_message_links
    (gmail_message_id, gmail_thread_id, from_email, subject, snippet,
     lead_id, customer_id, created_by)
  SELECT e.gmail_id, e.thread_id, e.from_email, e.subject, e.snippet,
         _lead_id, _customer_id, v_actor
  FROM public.emails e
  WHERE e.thread_id = _thread_id
  ON CONFLICT DO NOTHING;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_email_thread(text, uuid, uuid, uuid) TO authenticated;