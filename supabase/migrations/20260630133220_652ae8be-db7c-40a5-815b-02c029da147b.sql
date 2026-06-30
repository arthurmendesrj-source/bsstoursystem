ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS source_email_id uuid REFERENCES public.emails(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_email_subject text,
  ADD COLUMN IF NOT EXISTS source_email_from text,
  ADD COLUMN IF NOT EXISTS source_email_snippet text,
  ADD COLUMN IF NOT EXISTS source_email_received_at timestamptz;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_email_id uuid REFERENCES public.emails(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_email_subject text,
  ADD COLUMN IF NOT EXISTS source_email_from text,
  ADD COLUMN IF NOT EXISTS source_email_snippet text,
  ADD COLUMN IF NOT EXISTS source_email_received_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_leads_source_email_id ON public.leads(source_email_id);
CREATE INDEX IF NOT EXISTS idx_tasks_source_email_id ON public.tasks(source_email_id);