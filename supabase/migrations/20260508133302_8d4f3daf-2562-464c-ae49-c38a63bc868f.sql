
ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS full_sync_page_token text,
  ADD COLUMN IF NOT EXISTS full_sync_in_progress boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS full_sync_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS full_sync_total_synced integer NOT NULL DEFAULT 0;

ALTER TABLE public.email_attachments
  ADD COLUMN IF NOT EXISTS storage_path text;

CREATE INDEX IF NOT EXISTS emails_owner_internal_date_idx
  ON public.emails (owner_email, internal_date DESC);
CREATE INDEX IF NOT EXISTS emails_thread_id_idx
  ON public.emails (thread_id);

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users read email attachments" ON storage.objects;
CREATE POLICY "Users read email attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND public.user_has_email_account(auth.uid(), split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS "Users write email attachments" ON storage.objects;
CREATE POLICY "Users write email attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND public.user_has_email_account(auth.uid(), split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS "Users update email attachments" ON storage.objects;
CREATE POLICY "Users update email attachments"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND public.user_has_email_account(auth.uid(), split_part(name, '/', 1))
  );

DROP POLICY IF EXISTS "Users delete email attachments" ON storage.objects;
CREATE POLICY "Users delete email attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND public.user_has_email_account(auth.uid(), split_part(name, '/', 1))
  );
