
-- =========================================================
-- 1) Fix infinite recursion on tenant_members policies
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_tenant_admin(_tenant_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members
    WHERE tenant_id = _tenant_id
      AND user_id = _user_id
      AND is_active = true
      AND role_in_tenant IN ('owner','admin')
  ) OR public.is_super_admin(_user_id);
$$;

DROP POLICY IF EXISTS tm_select ON public.tenant_members;
DROP POLICY IF EXISTS tm_admin_all ON public.tenant_members;

CREATE POLICY tm_select_own ON public.tenant_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY tm_select_admins ON public.tenant_members
  FOR SELECT TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()));

CREATE POLICY tm_admin_modify ON public.tenant_members
  FOR ALL TO authenticated
  USING (public.is_tenant_admin(tenant_id, auth.uid()))
  WITH CHECK (public.is_tenant_admin(tenant_id, auth.uid()));

-- =========================================================
-- 2) emails table (cache of Gmail messages per user)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder text NOT NULL CHECK (folder IN ('inbox','sent')),
  gmail_id text NOT NULL,
  thread_id text,
  message_id text,
  from_email text,
  from_name text,
  to_emails text[] DEFAULT '{}',
  cc_emails text[] DEFAULT '{}',
  subject text,
  snippet text,
  body_text text,
  body_html text,
  internal_date timestamptz,
  labels text[] DEFAULT '{}',
  is_unread boolean NOT NULL DEFAULT false,
  has_attachments boolean NOT NULL DEFAULT false,
  body_loaded boolean NOT NULL DEFAULT false,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, gmail_id)
);

CREATE INDEX IF NOT EXISTS idx_emails_user_folder_date
  ON public.emails (user_id, folder, internal_date DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON public.emails (thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_lead ON public.emails (lead_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emails TO authenticated;
GRANT ALL ON public.emails TO service_role;

ALTER TABLE public.emails ENABLE ROW LEVEL SECURITY;

-- Owner can do everything on own emails
CREATE POLICY emails_owner_all ON public.emails
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Manager (hierarchy) can read subordinates' emails
CREATE POLICY emails_manager_read ON public.emails
  FOR SELECT TO authenticated
  USING (public.is_subordinate_of(user_id, auth.uid()));

-- Admin can read all emails
CREATE POLICY emails_admin_read ON public.emails
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_emails_updated_at
  BEFORE UPDATE ON public.emails
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 3) email_sync_state table
-- =========================================================
CREATE TABLE IF NOT EXISTS public.email_sync_state (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  folder text NOT NULL CHECK (folder IN ('inbox','sent')),
  last_history_id text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, folder)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_sync_state TO authenticated;
GRANT ALL ON public.email_sync_state TO service_role;

ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY ess_owner_all ON public.email_sync_state
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY ess_admin_read ON public.email_sync_state
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_subordinate_of(user_id, auth.uid()));

CREATE TRIGGER trg_email_sync_state_updated_at
  BEFORE UPDATE ON public.email_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
