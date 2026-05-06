
CREATE TABLE IF NOT EXISTS public.user_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  actor_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_created_at ON public.user_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_audit_log_target ON public.user_audit_log (target_user_id);

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/Diretor read user_audit_log"
  ON public.user_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(), 'diretor'::app_role));
