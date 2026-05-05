-- Função: usuário pode ver/receber notificações sobre um lead?
CREATE OR REPLACE FUNCTION public.can_access_lead(_lead_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.id = _lead_id
      AND (l.assigned_to = _user_id OR l.created_by = _user_id)
  ) OR public.is_admin(_user_id);
$$;

-- Substitui a policy de SELECT em notification_logs para incluir quem está envolvido com o lead
DROP POLICY IF EXISTS "Users view own notification_logs or admin all" ON public.notification_logs;

CREATE POLICY "Users view notification_logs by ownership lead or admin"
  ON public.notification_logs FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_admin(auth.uid())
    OR (lead_id IS NOT NULL AND public.can_access_lead(lead_id, auth.uid()))
  );