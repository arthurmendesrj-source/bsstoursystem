-- Função get_subordinates: retorna user_ids de quem está abaixo na hierarquia
CREATE OR REPLACE FUNCTION public.role_rank(_role app_role)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE _role
    WHEN 'admin' THEN 4
    WHEN 'diretor' THEN 3
    WHEN 'gerente' THEN 2
    WHEN 'supervisor' THEN 1
    WHEN 'operador' THEN 0
    ELSE -1
  END;
$$;

CREATE OR REPLACE FUNCTION public.max_role_rank(_user_id uuid)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(MAX(public.role_rank(role)), -1)
  FROM public.user_roles WHERE user_id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_subordinates(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH my_rank AS (SELECT public.max_role_rank(_user_id) AS r)
  SELECT DISTINCT ur.user_id
  FROM public.user_roles ur, my_rank
  WHERE ur.user_id <> _user_id
    AND public.role_rank(ur.role) < my_rank.r
    AND my_rank.r > 0;
$$;

CREATE OR REPLACE FUNCTION public.is_subordinate_of(_target uuid, _manager uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.get_subordinates(_manager) s WHERE s = _target);
$$;

-- LEADS: permitir criar/ver/editar leads de subordinados
DROP POLICY IF EXISTS leads_insert ON public.leads;
CREATE POLICY leads_insert ON public.leads
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (is_admin(auth.uid()) OR has_module_permission(auth.uid(), 'leads', 'create'))
  AND (
    assigned_to IS NULL
    OR assigned_to = auth.uid()
    OR public.is_subordinate_of(assigned_to, auth.uid())
  )
);

DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
FOR SELECT TO authenticated
USING (
  is_admin(auth.uid())
  OR (has_module_permission(auth.uid(), 'leads', 'view') AND (
    has_role(auth.uid(), 'operador') = false
    OR auth.uid() = assigned_to
    OR auth.uid() = created_by
    OR public.is_subordinate_of(assigned_to, auth.uid())
    OR public.is_subordinate_of(created_by, auth.uid())
  ))
);

DROP POLICY IF EXISTS leads_update ON public.leads;
CREATE POLICY leads_update ON public.leads
FOR UPDATE TO authenticated
USING (
  is_admin(auth.uid())
  OR (has_module_permission(auth.uid(), 'leads', 'edit') AND (
    has_role(auth.uid(), 'operador') = false
    OR auth.uid() = assigned_to
    OR auth.uid() = created_by
    OR public.is_subordinate_of(assigned_to, auth.uid())
    OR public.is_subordinate_of(created_by, auth.uid())
  ))
);

-- TASKS: permitir gerente/diretor criar e ver tarefas de subordinados
DROP POLICY IF EXISTS "Authenticated insert tasks" ON public.tasks;
CREATE POLICY "Authenticated insert tasks" ON public.tasks
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND (
    assigned_to IS NULL
    OR assigned_to = auth.uid()
    OR public.is_subordinate_of(assigned_to, auth.uid())
    OR is_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Assigned or admin read tasks" ON public.tasks;
CREATE POLICY "Assigned or admin read tasks" ON public.tasks
FOR SELECT TO authenticated
USING (
  auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR is_admin(auth.uid())
  OR public.is_subordinate_of(assigned_to, auth.uid())
  OR public.is_subordinate_of(created_by, auth.uid())
);

DROP POLICY IF EXISTS "Assigned or admin update tasks" ON public.tasks;
CREATE POLICY "Assigned or admin update tasks" ON public.tasks
FOR UPDATE TO authenticated
USING (
  auth.uid() = assigned_to
  OR auth.uid() = created_by
  OR is_admin(auth.uid())
  OR public.is_subordinate_of(assigned_to, auth.uid())
  OR public.is_subordinate_of(created_by, auth.uid())
);