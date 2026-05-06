UPDATE public.permission_modules
SET sensitive_fields = '["unit_cost","markup_pct","discount","total_amount"]'::jsonb
WHERE key = 'quotes';

UPDATE public.permission_modules
SET sensitive_fields = '["cost","total_amount"]'::jsonb
WHERE key = 'bookings';

UPDATE public.permission_modules
SET sensitive_fields = '["commission_pct"]'::jsonb
WHERE key = 'suppliers';

-- Default field rules: hide unit_cost / markup / commission / discount from operador
INSERT INTO public.role_field_permissions (role, module_key, field_key, can_view, can_edit)
VALUES
  ('operador','quotes','total_amount', true, false),
  ('operador','bookings','total_amount', true, false),
  ('operador','quotes','discount', false, false),
  ('operador','suppliers','commission_pct', false, false)
ON CONFLICT DO NOTHING;