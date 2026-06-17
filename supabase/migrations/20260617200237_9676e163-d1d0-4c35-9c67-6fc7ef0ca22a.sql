ALTER TABLE public.email_accounts DROP CONSTRAINT IF EXISTS email_accounts_provider_check;
ALTER TABLE public.email_accounts ADD CONSTRAINT email_accounts_provider_check CHECK (provider IN ('gmail','gmail_oauth'));
DROP INDEX IF EXISTS public.email_accounts_user_provider_unique;
ALTER TABLE public.email_accounts ADD CONSTRAINT email_accounts_user_provider_key UNIQUE (user_id, provider);