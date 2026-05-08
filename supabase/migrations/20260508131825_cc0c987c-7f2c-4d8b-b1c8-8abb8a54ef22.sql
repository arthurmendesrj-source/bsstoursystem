CREATE OR REPLACE FUNCTION public.user_has_email_account(_user_id uuid, _email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_email_accounts uea
      WHERE uea.user_id = _user_id
        AND lower(uea.email_address) = lower(_email)
    )
$$;

ALTER TABLE public.emails
ADD COLUMN IF NOT EXISTS owner_email text;

DROP POLICY IF EXISTS "Authenticated read email_labels" ON public.email_labels;
CREATE POLICY "Users read linked email_labels"
ON public.email_labels
FOR SELECT
TO authenticated
USING (public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Staff write email_labels" ON public.email_labels;
CREATE POLICY "Users write linked email_labels"
ON public.email_labels
FOR ALL
TO authenticated
USING (public.user_has_email_account(auth.uid(), owner_email))
WITH CHECK (public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Authenticated read email_threads" ON public.email_threads;
CREATE POLICY "Users read linked email_threads"
ON public.email_threads
FOR SELECT
TO authenticated
USING (public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Staff write email_threads" ON public.email_threads;
CREATE POLICY "Users write linked email_threads"
ON public.email_threads
FOR ALL
TO authenticated
USING (public.user_has_email_account(auth.uid(), owner_email))
WITH CHECK (public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Authenticated read email_sync_state" ON public.email_sync_state;
CREATE POLICY "Users read linked email_sync_state"
ON public.email_sync_state
FOR SELECT
TO authenticated
USING (public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Staff write email_sync_state" ON public.email_sync_state;
CREATE POLICY "Users write linked email_sync_state"
ON public.email_sync_state
FOR ALL
TO authenticated
USING (public.user_has_email_account(auth.uid(), owner_email))
WITH CHECK (public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Authenticated read emails" ON public.emails;
CREATE POLICY "Users read linked emails"
ON public.emails
FOR SELECT
TO authenticated
USING (owner_email IS NOT NULL AND public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Staff insert emails" ON public.emails;
CREATE POLICY "Users insert linked emails"
ON public.emails
FOR INSERT
TO authenticated
WITH CHECK (owner_email IS NOT NULL AND public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Staff update emails" ON public.emails;
CREATE POLICY "Users update linked emails"
ON public.emails
FOR UPDATE
TO authenticated
USING (owner_email IS NOT NULL AND public.user_has_email_account(auth.uid(), owner_email))
WITH CHECK (owner_email IS NOT NULL AND public.user_has_email_account(auth.uid(), owner_email));

DROP POLICY IF EXISTS "Authenticated read email_attachments" ON public.email_attachments;
CREATE POLICY "Users read linked email_attachments"
ON public.email_attachments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.emails e
    WHERE e.id = email_attachments.email_id
      AND e.owner_email IS NOT NULL
      AND public.user_has_email_account(auth.uid(), e.owner_email)
  )
);

DROP POLICY IF EXISTS "Staff write email_attachments" ON public.email_attachments;
CREATE POLICY "Users write linked email_attachments"
ON public.email_attachments
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.emails e
    WHERE e.id = email_attachments.email_id
      AND e.owner_email IS NOT NULL
      AND public.user_has_email_account(auth.uid(), e.owner_email)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.emails e
    WHERE e.id = email_attachments.email_id
      AND e.owner_email IS NOT NULL
      AND public.user_has_email_account(auth.uid(), e.owner_email)
  )
);