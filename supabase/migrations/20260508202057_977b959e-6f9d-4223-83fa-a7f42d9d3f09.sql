-- Add columns to support dynamic label queue + open-ended history sync
ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS full_sync_label_queue text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS full_sync_empty_streak int NOT NULL DEFAULT 0;

-- Realtime for live progress UI
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='email_sync_state'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.email_sync_state';
  END IF;
END$$;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;