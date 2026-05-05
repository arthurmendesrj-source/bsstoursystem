
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS last_assigned_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_assigned_notified_to uuid,
  ADD COLUMN IF NOT EXISTS last_status_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_status_notified_value lead_status;
