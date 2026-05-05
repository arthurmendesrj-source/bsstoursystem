ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'suporte',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'media',
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS time_spent_minutes integer,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS email_id uuid;

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_category_check,
  ADD CONSTRAINT tasks_category_check CHECK (category IN ('negocio','suporte'));

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_check,
  ADD CONSTRAINT tasks_priority_check CHECK (priority IN ('baixa','media','alta'));

ALTER TABLE public.tasks
  DROP CONSTRAINT IF EXISTS tasks_source_check,
  ADD CONSTRAINT tasks_source_check CHECK (source IN ('manual','email','lead'));

CREATE OR REPLACE FUNCTION public.handle_task_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.completed = true AND (OLD.completed IS DISTINCT FROM NEW.completed) THEN
    IF NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
    IF NEW.time_spent_minutes IS NULL AND NEW.started_at IS NOT NULL THEN
      NEW.time_spent_minutes := GREATEST(1, EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))/60)::int;
    END IF;
  END IF;
  IF NEW.completed = false THEN
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_completion ON public.tasks;
CREATE TRIGGER trg_tasks_completion
BEFORE UPDATE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.handle_task_completion();

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON public.tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON public.tasks(completed);
CREATE INDEX IF NOT EXISTS idx_tasks_lead_id ON public.tasks(lead_id);