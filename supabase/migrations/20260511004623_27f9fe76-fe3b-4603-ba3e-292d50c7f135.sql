
DROP POLICY IF EXISTS "Assigned or admin read tasks" ON public.tasks;
DROP POLICY IF EXISTS "Assigned or admin update tasks" ON public.tasks;
DROP POLICY IF EXISTS "Authenticated insert tasks" ON public.tasks;

CREATE POLICY "Authenticated read tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Assignee or superior update tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = assigned_to
    OR public.is_admin(auth.uid())
    OR public.is_subordinate_of(assigned_to, auth.uid())
  )
  WITH CHECK (
    auth.uid() = assigned_to
    OR public.is_admin(auth.uid())
    OR public.is_subordinate_of(assigned_to, auth.uid())
  );
