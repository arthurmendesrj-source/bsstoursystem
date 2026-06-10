
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name text;
  v_is_invited boolean;
  v_base_slug text;
  v_slug text;
  v_suffix int := 0;
  v_tenant_id uuid;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);

  -- profile
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, v_full_name)
  ON CONFLICT DO NOTHING;

  -- primary email account
  IF NEW.email IS NOT NULL AND length(NEW.email) > 0 THEN
    INSERT INTO public.user_email_accounts (user_id, email_address, is_primary)
    VALUES (NEW.id, lower(NEW.email), true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Detect invitation: either invited_at is set by Supabase, or our edge
  -- function stamped invited_by_tenant_id in user_metadata.
  v_is_invited := (NEW.invited_at IS NOT NULL)
    OR (NEW.raw_user_meta_data ? 'invited_by_tenant_id');

  IF v_is_invited THEN
    RETURN NEW;
  END IF;

  -- Direct signup -> master account. Create tenant + owner membership + admin/diretor roles.
  v_base_slug := NULLIF(public.slugify_text(v_full_name), '');
  IF v_base_slug IS NULL OR length(v_base_slug) < 2 THEN
    v_base_slug := 't-' || substring(NEW.id::text from 1 for 8);
  END IF;
  IF length(v_base_slug) > 50 THEN
    v_base_slug := substring(v_base_slug from 1 for 50);
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.tenants WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  END LOOP;

  INSERT INTO public.tenants (name, slug, created_by)
  VALUES (v_full_name, v_slug, NEW.id)
  RETURNING id INTO v_tenant_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role_in_tenant, is_active)
  VALUES (v_tenant_id, NEW.id, 'owner', true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin'::app_role), (NEW.id, 'diretor'::app_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;
