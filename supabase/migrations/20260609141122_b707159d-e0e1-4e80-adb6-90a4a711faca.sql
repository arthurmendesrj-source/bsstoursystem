ALTER TABLE public.user_gmail_tokens
  ADD COLUMN IF NOT EXISTS connected_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_refresh_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_refresh_error text,
  ADD COLUMN IF NOT EXISTS refresh_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;