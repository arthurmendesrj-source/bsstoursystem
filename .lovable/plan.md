## Objetivo

Pré-configurar permissões por papel com perfil **conservador (mínimo)** e adicionar **edit-gating** na tela de Permissões: ninguém pode conceder a outros um acesso que ele próprio não tem (admin sem restrição).

## 1) Defaults conservadores (migration de dados)

Aplicar via migration `INSERT … ON CONFLICT DO NOTHING` em `role_module_permissions` e `role_field_permissions` para os papéis `diretor`, `gerente`, `supervisor`, `operador`. `admin` é tratado em código (acesso total) — não precisa de linhas.

Por papel, em todos os módulos do catálogo (`leads, customers, quotes, bookings, suppliers, supplier_rates, supplier_documents, packages, itineraries, activities, emails, financial, sla, users`):

- **diretor / gerente / supervisor / operador** → `can_view = true` apenas em: `leads, customers, quotes, bookings, suppliers, packages, itineraries, activities, emails`. Demais módulos e ações (`create/edit/delete/approve`) ficam `false`.
- **financial, sla, users, supplier_rates, supplier_documents** → tudo `false` para não-admin.

Campos sensíveis (`role_field_permissions`) — para todos os papéis não-admin, em todos os campos catalogados em `permission_modules.sensitive_fields` (custo, markup, comissão, descontos, total, unit_price, etc.):
- `can_view = false`, `can_edit = false` → tudo mascarado por padrão.

Resultado: papéis novos enxergam o básico, sem nada financeiro/sensível, sem poder criar/editar. Admin libera manualmente conforme necessário.

## 2) Edit-gating na tela de Permissões (`src/routes/settings.permissions.tsx`)

Hoje só admin abre a tela. Vamos manter, mas preparar para o futuro (quando outros papéis tiverem `users.edit`):

- Carregar as permissões do **usuário atual** via `usePermissions()` (`can`, `canField`).
- Para cada checkbox **de módulo** (`role × módulo × ação`): `disabled` se `!can(módulo, ação)` (admin sempre pode).
- Para cada checkbox **de campo sensível** (`role × módulo × campo × view|edit`): `disabled` se `!canField(módulo, campo, "view"|"edit")`.
- Linha do `admin` continua sempre desabilitada (não editável).
- Tooltip nos checkboxes desabilitados: "Você não pode conceder um acesso que não possui."
- No `save()`, defesa em profundidade: filtrar do payload qualquer linha que viole a regra antes do upsert (evita burlar via DevTools — RLS de admin já protege hoje, mas mantemos consistência quando abrirmos a tela a outros papéis).

## 3) Indicador visual

Adicionar uma legenda no topo da aba "Por módulo" e "Campos sensíveis":
> "Checkboxes em cinza não podem ser alterados porque você não possui esse acesso."

## Fora de escopo

- Não atribuir papéis às 4 contas de simulação (você fará em `/users`).
- Não mexer em RLS do banco — as policies já usam `has_module_permission` / `is_admin`.
- Não alterar o catálogo `permission_modules`.

## Detalhes técnicos

- Migration: somente `INSERT … ON CONFLICT (role, module_key) DO NOTHING` e `INSERT … ON CONFLICT (role, module_key, field_key) DO NOTHING`. Não sobrescreve customizações que você já tenha feito.
- Edit-gating é puramente client-side + filtro no save; a fonte de verdade da segurança continua sendo RLS + `has_module_permission` no Postgres.
