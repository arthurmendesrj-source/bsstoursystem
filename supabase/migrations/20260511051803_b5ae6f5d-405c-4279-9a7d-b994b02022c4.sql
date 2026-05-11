
ALTER TABLE public.emails DROP CONSTRAINT IF EXISTS emails_gmail_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS emails_owner_gmail_id_key ON public.emails (owner_email, gmail_id);

CREATE UNIQUE INDEX IF NOT EXISTS email_threads_owner_id_key ON public.email_threads (owner_email, id);
