DO $$
DECLARE
  r app_role;
  basic_modules text[] := ARRAY['leads','customers','quotes','bookings','suppliers','packages','itineraries','activities','emails'];
  all_modules text[] := ARRAY['leads','customers','quotes','bookings','suppliers','supplier_rates','supplier_documents','packages','itineraries','activities','emails','financial','sla','users'];
  m text;
  non_admin_roles app_role[] := ARRAY['diretor','gerente','supervisor','operador']::app_role[];
  mod_rec RECORD;
  fk text;
BEGIN
  FOREACH r IN ARRAY non_admin_roles LOOP
    FOREACH m IN ARRAY all_modules LOOP
      INSERT INTO public.role_module_permissions (role, module_key, can_view, can_create, can_edit, can_delete, can_approve)
      VALUES (r, m, (m = ANY(basic_modules)), false, false, false, false)
      ON CONFLICT (role, module_key) DO NOTHING;
    END LOOP;
  END LOOP;

  FOR mod_rec IN SELECT key, sensitive_fields FROM public.permission_modules WHERE jsonb_array_length(sensitive_fields) > 0 LOOP
    FOREACH r IN ARRAY non_admin_roles LOOP
      FOR fk IN SELECT jsonb_array_elements_text(mod_rec.sensitive_fields) LOOP
        INSERT INTO public.role_field_permissions (role, module_key, field_key, can_view, can_edit)
        VALUES (r, mod_rec.key, fk, false, false)
        ON CONFLICT (role, module_key, field_key) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;