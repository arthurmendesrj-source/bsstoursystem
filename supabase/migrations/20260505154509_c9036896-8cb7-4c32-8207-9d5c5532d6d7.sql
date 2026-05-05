-- Histórico de notificações enviadas
CREATE TYPE public.notification_channel AS ENUM ('push', 'in_app', 'email', 'whatsapp');
CREATE TYPE public.notification_status AS ENUM ('success', 'error', 'skipped');

CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lead_id uuid,
  channel public.notification_channel NOT NULL DEFAULT 'push',
  status public.notification_status NOT NULL,
  title text NOT NULL,
  body text,
  error_detail text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_logs_user_sent ON public.notification_logs (user_id, sent_at DESC);
CREATE INDEX idx_notification_logs_lead ON public.notification_logs (lead_id);

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notification_logs or admin all"
ON public.notification_logs FOR SELECT TO authenticated
USING ((auth.uid() = user_id) OR public.is_admin(auth.uid()));

CREATE POLICY "Authenticated insert notification_logs"
ON public.notification_logs FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) OR public.is_admin(auth.uid()));

CREATE POLICY "Admins delete notification_logs"
ON public.notification_logs FOR DELETE TO authenticated
USING (public.is_admin(auth.uid()));