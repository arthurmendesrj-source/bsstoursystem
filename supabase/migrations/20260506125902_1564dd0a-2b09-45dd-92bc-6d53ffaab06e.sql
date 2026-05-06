
-- 2) Migrar user_roles antigos para novos
INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'gerente'::app_role FROM public.user_roles WHERE role = 'operacional'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'supervisor'::app_role FROM public.user_roles WHERE role = 'vendedor'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT user_id, 'diretor'::app_role FROM public.user_roles WHERE role = 'financeiro'
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) Catálogo de módulos
CREATE TABLE IF NOT EXISTS public.permission_modules (
  key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  sensitive_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.permission_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read permission_modules"
  ON public.permission_modules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage permission_modules"
  ON public.permission_modules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 4) Permissões por módulo
CREATE TABLE IF NOT EXISTS public.role_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  module_key text NOT NULL REFERENCES public.permission_modules(key) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_approve boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module_key)
);

ALTER TABLE public.role_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read role_module_permissions"
  ON public.role_module_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage role_module_permissions"
  ON public.role_module_permissions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 5) Permissões por campo
CREATE TABLE IF NOT EXISTS public.role_field_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  module_key text NOT NULL REFERENCES public.permission_modules(key) ON DELETE CASCADE,
  field_key text NOT NULL,
  can_view boolean NOT NULL DEFAULT true,
  can_edit boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, module_key, field_key)
);

ALTER TABLE public.role_field_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read role_field_permissions"
  ON public.role_field_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins manage role_field_permissions"
  ON public.role_field_permissions FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- 6) Função de checagem
CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
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
  );
$$;

REVOKE EXECUTE ON FUNCTION public.has_module_permission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_module_permission(uuid, text, text) TO authenticated, service_role;

-- 7) Catálogo de módulos (seed)
INSERT INTO public.permission_modules (key, label, description, sensitive_fields, sort_order) VALUES
  ('leads',        'Leads',                'CRM de leads',                       '[]', 10),
  ('customers',    'Clientes',             'Cadastro de clientes',               '["tax_id","document_number","passport_number"]', 20),
  ('quotes',       'Cotações',             'Propostas e itens',                  '["unit_cost","markup_pct","discount"]', 30),
  ('bookings',     'Reservas',             'Reservas e operacional',             '["cost"]', 40),
  ('suppliers',    'Fornecedores',         'Fornecedores e contatos',            '[]', 50),
  ('supplier_rates','Tarifários',          'Tarifas de fornecedores',            '["unit_price","unit_cost"]', 55),
  ('supplier_documents','Documentos de fornecedor','PDFs e tarifários',         '[]', 56),
  ('packages',     'Pacotes',              'Catálogo de pacotes',                '["base_price"]', 60),
  ('itineraries',  'Roteiros',             'Bíblia de roteiros',                 '[]', 70),
  ('activities',   'Operacional/Atividades','Operações de campo',                '[]', 80),
  ('emails',       'E-mails',              'Caixa de e-mail integrada',          '[]', 90),
  ('financial',    'Financeiro',           'Câmbio e financeiro',                '[]', 100),
  ('sla',          'SLA',                  'Configuração de SLA',                '[]', 110),
  ('users',        'Usuários e permissões','Gestão de usuários e alçadas',       '[]', 120)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, sensitive_fields = EXCLUDED.sensitive_fields, sort_order = EXCLUDED.sort_order;

-- 8) Seed da matriz por módulo
-- helper: insere para todos os módulos com flags padrão
DO $$
DECLARE
  r record;
  m record;
BEGIN
  FOR r IN SELECT unnest(ARRAY['admin','diretor','gerente','supervisor','operador']::app_role[]) AS role LOOP
    FOR m IN SELECT key FROM public.permission_modules LOOP
      INSERT INTO public.role_module_permissions (role, module_key, can_view, can_create, can_edit, can_delete, can_approve)
      VALUES (r.role, m.key,
        -- defaults: admin tudo; diretor tudo exceto users; gerente quase tudo; supervisor view+create+edit; operador view
        CASE r.role
          WHEN 'admin' THEN true
          WHEN 'diretor' THEN m.key <> 'users'
          WHEN 'gerente' THEN m.key NOT IN ('users')
          WHEN 'supervisor' THEN m.key IN ('leads','customers','quotes','bookings','suppliers','supplier_rates','supplier_documents','packages','itineraries','activities','emails')
          WHEN 'operador' THEN m.key IN ('leads','customers','quotes','bookings','suppliers','supplier_rates','supplier_documents','packages','itineraries','activities','emails')
        END,
        CASE r.role
          WHEN 'admin' THEN true
          WHEN 'diretor' THEN m.key <> 'users'
          WHEN 'gerente' THEN m.key NOT IN ('users','sla')
          WHEN 'supervisor' THEN m.key IN ('leads','customers','quotes','bookings','activities','emails')
          WHEN 'operador' THEN m.key IN ('activities','emails')
        END,
        CASE r.role
          WHEN 'admin' THEN true
          WHEN 'diretor' THEN m.key <> 'users'
          WHEN 'gerente' THEN m.key NOT IN ('users')
          WHEN 'supervisor' THEN m.key IN ('leads','customers','quotes','bookings','activities','emails')
          WHEN 'operador' THEN m.key IN ('leads','activities','emails')
        END,
        CASE r.role
          WHEN 'admin' THEN true
          WHEN 'diretor' THEN m.key NOT IN ('users','sla')
          WHEN 'gerente' THEN m.key IN ('leads','customers','quotes','bookings','activities','emails')
          ELSE false
        END,
        CASE r.role
          WHEN 'admin' THEN true
          WHEN 'diretor' THEN true
          WHEN 'gerente' THEN m.key IN ('quotes','bookings')
          ELSE false
        END
      )
      ON CONFLICT (role, module_key) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- 9) Seed de campos sensíveis (custos ocultos para supervisor/operador)
DO $$
DECLARE
  r record;
  m record;
  f text;
BEGIN
  FOR m IN SELECT key, sensitive_fields FROM public.permission_modules WHERE jsonb_array_length(sensitive_fields) > 0 LOOP
    FOR f IN SELECT jsonb_array_elements_text(m.sensitive_fields) LOOP
      FOR r IN SELECT unnest(ARRAY['admin','diretor','gerente','supervisor','operador']::app_role[]) AS role LOOP
        INSERT INTO public.role_field_permissions (role, module_key, field_key, can_view, can_edit)
        VALUES (
          r.role, m.key, f,
          CASE
            WHEN r.role IN ('admin','diretor','gerente') THEN true
            WHEN f IN ('unit_cost','markup_pct','cost','base_price') AND r.role IN ('supervisor','operador') THEN false
            WHEN f IN ('unit_price') AND r.role IN ('supervisor','operador') THEN false
            ELSE true
          END,
          CASE
            WHEN r.role IN ('admin','diretor','gerente') THEN true
            WHEN r.role = 'supervisor' AND f IN ('discount') THEN true
            ELSE false
          END
        )
        ON CONFLICT (role, module_key, field_key) DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
