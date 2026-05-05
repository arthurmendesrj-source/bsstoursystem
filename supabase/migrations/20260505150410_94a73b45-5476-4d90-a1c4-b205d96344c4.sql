
-- Snoozes table
CREATE TABLE public.lead_alert_snoozes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL,
  user_id uuid NOT NULL,
  snoozed_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, user_id)
);

CREATE INDEX idx_lead_alert_snoozes_user ON public.lead_alert_snoozes(user_id, snoozed_until);

ALTER TABLE public.lead_alert_snoozes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own snoozes or admin all"
ON public.lead_alert_snoozes FOR SELECT
TO authenticated
USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "Users insert own snoozes"
ON public.lead_alert_snoozes FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own snoozes"
ON public.lead_alert_snoozes FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own snoozes"
ON public.lead_alert_snoozes FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER trg_lead_alert_snoozes_updated
BEFORE UPDATE ON public.lead_alert_snoozes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Daily followup goal on profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS daily_followup_goal int NOT NULL DEFAULT 10;
