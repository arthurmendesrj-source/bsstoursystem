ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS wipe_status text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS wipe_step text,
  ADD COLUMN IF NOT EXISTS wipe_deleted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wipe_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS wipe_finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS wipe_error text;