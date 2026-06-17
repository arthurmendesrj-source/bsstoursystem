
ALTER TABLE public.email_accounts
  ALTER COLUMN smtp_host DROP NOT NULL,
  ALTER COLUMN smtp_port DROP NOT NULL,
  ALTER COLUMN imap_host DROP NOT NULL,
  ALTER COLUMN imap_port DROP NOT NULL,
  ALTER COLUMN username DROP NOT NULL,
  ALTER COLUMN password_encrypted DROP NOT NULL;

ALTER TABLE public.email_accounts
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scope text;
