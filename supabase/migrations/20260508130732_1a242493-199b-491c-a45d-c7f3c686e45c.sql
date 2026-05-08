
CREATE TABLE public.user_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email_address text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, email_address)
);

CREATE INDEX idx_user_email_accounts_user ON public.user_email_accounts(user_id);
CREATE INDEX idx_user_email_accounts_email ON public.user_email_accounts(lower(email_address));

ALTER TABLE public.user_email_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own email accounts or admin all"
  ON public.user_email_accounts FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "Admins manage email accounts"
  ON public.user_email_accounts FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.user_email_accounts (user_id, email_address, is_primary)
VALUES ('733024b9-2dbe-4319-a98f-4815e59a5ac2', 'booking@adatours.com', true)
ON CONFLICT (user_id, email_address) DO NOTHING;
