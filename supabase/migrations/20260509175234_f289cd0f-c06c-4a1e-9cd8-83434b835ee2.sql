
-- 1) role_rank: include coordenador
CREATE OR REPLACE FUNCTION public.role_rank(_role app_role)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE _role
    WHEN 'admin' THEN 5
    WHEN 'diretor' THEN 4
    WHEN 'gerente' THEN 3
    WHEN 'coordenador' THEN 2
    WHEN 'supervisor' THEN 1
    WHEN 'operador' THEN 0
    ELSE -1
  END;
$$;

-- 2) Seed module permissions for coordenador (mirror supervisor)
INSERT INTO public.role_module_permissions (role, module_key, can_view, can_create, can_edit, can_delete, can_approve)
SELECT 'coordenador'::app_role, module_key, can_view, can_create, can_edit, can_delete, can_approve
FROM public.role_module_permissions
WHERE role = 'supervisor'::app_role
ON CONFLICT (role, module_key) DO NOTHING;

-- 3) Seed field permissions for coordenador (mirror supervisor)
INSERT INTO public.role_field_permissions (role, module_key, field_key, can_view, can_edit)
SELECT 'coordenador'::app_role, module_key, field_key, can_view, can_edit
FROM public.role_field_permissions
WHERE role = 'supervisor'::app_role
ON CONFLICT (role, module_key, field_key) DO NOTHING;

-- 4) handle_new_user: also seed user_email_accounts as primary inbox
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email))
  ON CONFLICT DO NOTHING;

  IF NEW.email IS NOT NULL AND length(NEW.email) > 0 THEN
    INSERT INTO public.user_email_accounts (user_id, email_address, is_primary)
    VALUES (NEW.id, lower(NEW.email), true)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
