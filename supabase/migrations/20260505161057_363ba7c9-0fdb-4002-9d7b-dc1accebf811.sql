
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS notified_due_soon_at timestamptz,
  ADD COLUMN IF NOT EXISTS notified_overdue_at timestamptz;
