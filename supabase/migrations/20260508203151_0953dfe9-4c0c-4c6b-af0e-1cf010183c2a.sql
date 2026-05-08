CREATE POLICY "Users insert own email accounts"
  ON public.user_email_accounts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own email accounts"
  ON public.user_email_accounts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);