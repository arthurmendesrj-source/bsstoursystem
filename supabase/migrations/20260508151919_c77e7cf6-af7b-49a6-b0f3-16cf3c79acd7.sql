ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS full_sync_current_month_offset integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_sync_window_days integer;