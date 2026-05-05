DROP TRIGGER IF EXISTS trg_email_create_task ON public.emails;
DROP TRIGGER IF EXISTS trg_email_sync_task_link ON public.emails;
DROP FUNCTION IF EXISTS public.create_task_from_email();
DROP FUNCTION IF EXISTS public.sync_task_from_email();