
CREATE TABLE IF NOT EXISTS public.sla_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  stage lead_status NOT NULL,
  overdue_hours_at_trigger int NOT NULL,
  hours_since_last_action numeric NOT NULL,
  triggered_at timestamptz NOT NULL DEFAULT now(),
  notified_admins uuid[] NOT NULL DEFAULT '{}',
  resolved_at timestamptz,
  resolution text,
  reassigned_to uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sla_escalations_lead ON public.sla_escalations(lead_id);
CREATE INDEX IF NOT EXISTS idx_sla_escalations_open ON public.sla_escalations(resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE public.sla_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage sla_escalations" ON public.sla_escalations
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

CREATE TRIGGER trg_sla_escalations_updated_at
  BEFORE UPDATE ON public.sla_escalations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Cron a cada 30 min
SELECT cron.unschedule('sla-escalation-check') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sla-escalation-check');
SELECT cron.schedule(
  'sla-escalation-check',
  '*/30 * * * *',
  $cron$
  SELECT net.http_post(
    url := public._notify_endpoint_url() || '/api/public/hooks/sla-escalations',
    headers := jsonb_build_object('Content-Type','application/json','apikey', public._notify_apikey()),
    body := '{}'::jsonb
  );
  $cron$
);
