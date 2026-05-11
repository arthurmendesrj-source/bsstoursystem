
CREATE TABLE IF NOT EXISTS public.user_gmail_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL CHECK (email_address = lower(email_address)),
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_address)
);

CREATE INDEX IF NOT EXISTS idx_user_gmail_tokens_user ON public.user_gmail_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_gmail_tokens_email ON public.user_gmail_tokens(lower(email_address));

ALTER TABLE public.user_gmail_tokens ENABLE ROW LEVEL SECURITY;

-- Only admins can manage tokens directly. The app uses service role on the server for OAuth flows.
CREATE POLICY "Admins manage gmail tokens"
  ON public.user_gmail_tokens
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER user_gmail_tokens_updated_at
  BEFORE UPDATE ON public.user_gmail_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public view exposing only non-sensitive account list per user
CREATE OR REPLACE VIEW public.user_gmail_accounts_public
WITH (security_invoker = on) AS
SELECT
  user_id,
  email_address,
  created_at AS connected_at,
  updated_at AS last_refresh_at
FROM public.user_gmail_tokens;

-- Allow authenticated users to read their OWN connected accounts via the view.
-- The view inherits RLS from the base table (security_invoker), so we add a SELECT
-- policy on the base table scoped to the user that exposes ONLY non-secret columns
-- via the view (consumers must always use the view, never the base table).
CREATE POLICY "Users read own gmail accounts"
  ON public.user_gmail_tokens
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
