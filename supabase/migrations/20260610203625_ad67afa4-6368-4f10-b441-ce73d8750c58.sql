-- Drop all email-related tables, triggers, and functions. Rebuild from scratch.
DROP TRIGGER IF EXISTS auto_link_email_by_thread_trg ON public.emails;
DROP FUNCTION IF EXISTS public.auto_link_email_by_thread() CASCADE;
DROP FUNCTION IF EXISTS public.link_email_thread(text, uuid, uuid, uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_has_email_account(uuid, text) CASCADE;

DROP TABLE IF EXISTS public.email_attachments CASCADE;
DROP TABLE IF EXISTS public.email_message_links CASCADE;
DROP TABLE IF EXISTS public.email_labels CASCADE;
DROP TABLE IF EXISTS public.email_sync_state CASCADE;
DROP TABLE IF EXISTS public.emails CASCADE;
DROP TABLE IF EXISTS public.email_threads CASCADE;
DROP TABLE IF EXISTS public.email_smtp_accounts CASCADE;
DROP TABLE IF EXISTS public.user_gmail_tokens CASCADE;
DROP TABLE IF EXISTS public.gmail_connection_audit CASCADE;
DROP TABLE IF EXISTS public.user_email_accounts CASCADE;

-- New, minimal email accounts table (SMTP/IMAP only). Password encrypted via pgcrypto.
CREATE TABLE public.email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  email text NOT NULL,
  display_name text,
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL,
  smtp_secure boolean NOT NULL DEFAULT true,
  imap_host text NOT NULL,
  imap_port integer NOT NULL,
  imap_secure boolean NOT NULL DEFAULT true,
  username text NOT NULL,
  password_encrypted bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_accounts TO authenticated;
GRANT ALL ON public.email_accounts TO service_role;

ALTER TABLE public.email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own email accounts" ON public.email_accounts
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_email_accounts_updated_at
  BEFORE UPDATE ON public.email_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();