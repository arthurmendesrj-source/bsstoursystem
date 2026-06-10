CREATE TABLE public.email_smtp_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  email_address text NOT NULL,
  display_name text,
  smtp_host text NOT NULL,
  smtp_port int NOT NULL,
  smtp_secure boolean NOT NULL DEFAULT true,
  imap_host text NOT NULL,
  imap_port int NOT NULL,
  imap_secure boolean NOT NULL DEFAULT true,
  auth_username text NOT NULL,
  auth_password_encrypted text NOT NULL,
  last_test_at timestamptz,
  last_test_ok boolean,
  last_test_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_address)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_smtp_accounts TO authenticated;
GRANT ALL ON public.email_smtp_accounts TO service_role;

ALTER TABLE public.email_smtp_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own smtp accounts"
ON public.email_smtp_accounts FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all smtp accounts"
ON public.email_smtp_accounts FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins delete any smtp account"
ON public.email_smtp_accounts FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_email_smtp_accounts_updated
BEFORE UPDATE ON public.email_smtp_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();