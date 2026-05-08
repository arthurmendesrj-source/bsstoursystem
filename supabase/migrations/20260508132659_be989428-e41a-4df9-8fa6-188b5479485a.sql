UPDATE public.emails SET owner_email = lower(owner_email) WHERE owner_email IS NOT NULL AND owner_email <> lower(owner_email);
DELETE FROM public.emails WHERE owner_email IS NULL OR owner_email = '';
UPDATE public.email_threads SET owner_email = lower(owner_email) WHERE owner_email <> lower(owner_email);
UPDATE public.email_labels SET owner_email = lower(owner_email) WHERE owner_email <> lower(owner_email);
UPDATE public.email_sync_state SET owner_email = lower(owner_email) WHERE owner_email <> lower(owner_email);
UPDATE public.user_email_accounts SET email_address = lower(email_address) WHERE email_address <> lower(email_address);

ALTER TABLE public.emails ADD CONSTRAINT emails_owner_email_lowercase CHECK (owner_email IS NULL OR owner_email = lower(owner_email));
ALTER TABLE public.email_threads ADD CONSTRAINT email_threads_owner_email_lowercase CHECK (owner_email = lower(owner_email));
ALTER TABLE public.email_labels ADD CONSTRAINT email_labels_owner_email_lowercase CHECK (owner_email = lower(owner_email));
ALTER TABLE public.email_sync_state ADD CONSTRAINT email_sync_state_owner_email_lowercase CHECK (owner_email = lower(owner_email));
ALTER TABLE public.user_email_accounts ADD CONSTRAINT user_email_accounts_email_lowercase CHECK (email_address = lower(email_address));