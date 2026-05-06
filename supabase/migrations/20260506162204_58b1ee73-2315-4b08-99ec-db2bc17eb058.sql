-- 1. user_module_permissions: overrides individuais por módulo
CREATE TABLE public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL,
  can_view boolean,
  can_create boolean,
  can_edit boolean,
  can_delete boolean,
  can_approve boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_module_permissions"
  ON public.user_module_permissions FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Users read own user_module_permissions"
  ON public.user_module_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

CREATE TRIGGER trg_ump_updated_at
  BEFORE UPDATE ON public.user_module_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. user_field_permissions: overrides individuais por campo sensível
CREATE TABLE public.user_field_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL,
  field_key text NOT NULL,
  can_view boolean,
  can_edit boolean,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key, field_key)
);

ALTER TABLE public.user_field_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage user_field_permissions"
  ON public.user_field_permissions FOR ALL TO authenticated
  USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Users read own user_field_permissions"
  ON public.user_field_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_admin(auth.uid()));

CREATE TRIGGER trg_ufp_updated_at
  BEFORE UPDATE ON public.user_field_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Atualiza has_module_permission: override individual tem prioridade sobre papel
CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH override AS (
    SELECT
      CASE _action
        WHEN 'view' THEN can_view
        WHEN 'create' THEN can_create
        WHEN 'edit' THEN can_edit
        WHEN 'delete' THEN can_delete
        WHEN 'approve' THEN can_approve
        ELSE NULL
      END AS val
    FROM public.user_module_permissions
    WHERE user_id = _user_id AND module_key = _module
    LIMIT 1
  )
  SELECT
    CASE
      WHEN (SELECT val FROM override) IS NOT NULL THEN (SELECT val FROM override)
      ELSE EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.role_module_permissions p ON p.role = ur.role
        WHERE ur.user_id = _user_id
          AND p.module_key = _module
          AND CASE _action
            WHEN 'view' THEN p.can_view
            WHEN 'create' THEN p.can_create
            WHEN 'edit' THEN p.can_edit
            WHEN 'delete' THEN p.can_delete
            WHEN 'approve' THEN p.can_approve
            ELSE false
          END
      )
    END;
$function$;

-- 4. has_field_permission: override individual → papel; se nada, libera
CREATE OR REPLACE FUNCTION public.has_field_permission(_user_id uuid, _module text, _field text, _action text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH override AS (
    SELECT
      CASE _action WHEN 'view' THEN can_view WHEN 'edit' THEN can_edit ELSE NULL END AS val
    FROM public.user_field_permissions
    WHERE user_id = _user_id AND module_key = _module AND field_key = _field
    LIMIT 1
  ),
  role_rows AS (
    SELECT
      CASE _action WHEN 'view' THEN p.can_view WHEN 'edit' THEN p.can_edit ELSE false END AS val
    FROM public.user_roles ur
    JOIN public.role_field_permissions p ON p.role = ur.role
    WHERE ur.user_id = _user_id AND p.module_key = _module AND p.field_key = _field
  )
  SELECT
    CASE
      WHEN public.is_admin(_user_id) THEN true
      WHEN (SELECT val FROM override) IS NOT NULL THEN (SELECT val FROM override)
      WHEN EXISTS (SELECT 1 FROM role_rows) THEN COALESCE((SELECT bool_or(val) FROM role_rows), false)
      ELSE true
    END;
$function$;