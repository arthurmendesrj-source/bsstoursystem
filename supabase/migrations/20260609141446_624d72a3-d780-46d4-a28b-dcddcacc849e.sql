CREATE TABLE IF NOT EXISTS public.gmail_connection_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL,
  event text NOT NULL CHECK (event IN ('connected','reconnected','disconnected','refresh_failed','refresh_recovered')),
  actor_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gmail_connection_audit_user_created_idx
  ON public.gmail_connection_audit (user_id, created_at DESC);

GRANT SELECT ON public.gmail_connection_audit TO authenticated;
GRANT ALL ON public.gmail_connection_audit TO service_role;

ALTER TABLE public.gmail_connection_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own gmail audit"
  ON public.gmail_connection_audit FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);