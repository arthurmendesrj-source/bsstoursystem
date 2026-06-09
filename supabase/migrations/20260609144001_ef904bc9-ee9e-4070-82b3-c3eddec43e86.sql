WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) AS rn
  FROM public.user_gmail_tokens
)
DELETE FROM public.user_gmail_tokens WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.user_gmail_tokens
  DROP CONSTRAINT IF EXISTS user_gmail_tokens_user_id_email_address_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_gmail_tokens_user_id_unique
  ON public.user_gmail_tokens (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS user_gmail_tokens_email_address_unique
  ON public.user_gmail_tokens (lower(email_address));

DROP POLICY IF EXISTS "Users read linked emails" ON public.emails;
CREATE POLICY "Users read linked emails"
ON public.emails
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (owner_email IS NOT NULL AND public.user_has_email_account(auth.uid(), owner_email))
  OR (lead_id IS NOT NULL AND public.can_access_lead(lead_id, auth.uid()))
  OR (customer_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.customers c
        WHERE c.id = emails.customer_id AND c.created_by = auth.uid()))
);

DROP POLICY IF EXISTS "Users read linked email_threads" ON public.email_threads;
CREATE POLICY "Users read linked email_threads"
ON public.email_threads
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid())
  OR public.user_has_email_account(auth.uid(), owner_email)
  OR EXISTS (
    SELECT 1 FROM public.emails e
    WHERE e.thread_id = email_threads.id
      AND (
        (e.lead_id IS NOT NULL AND public.can_access_lead(e.lead_id, auth.uid()))
        OR (e.customer_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.customers c
            WHERE c.id = e.customer_id AND c.created_by = auth.uid()))
      )
  )
);

DROP POLICY IF EXISTS "Users read linked email_attachments" ON public.email_attachments;
CREATE POLICY "Users read linked email_attachments"
ON public.email_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.emails e
    WHERE e.id = email_attachments.email_id
      AND (
        public.is_admin(auth.uid())
        OR (e.owner_email IS NOT NULL AND public.user_has_email_account(auth.uid(), e.owner_email))
        OR (e.lead_id IS NOT NULL AND public.can_access_lead(e.lead_id, auth.uid()))
        OR (e.customer_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.customers c
            WHERE c.id = e.customer_id AND c.created_by = auth.uid()))
      )
  )
);