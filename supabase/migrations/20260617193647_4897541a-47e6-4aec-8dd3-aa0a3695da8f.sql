-- Add OAuth columns to email_accounts and relax SMTP/IMAP requirements for OAuth-based accounts
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

-- One OAuth account per user (per provider): partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_user_provider_unique
  ON public.email_accounts(user_id, provider)
  WHERE provider IN ('gmail_oauth');
