CREATE POLICY "Users view subordinate roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.is_subordinate_of(user_id, auth.uid()));

CREATE POLICY "Users view subordinate profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_subordinate_of(user_id, auth.uid()));