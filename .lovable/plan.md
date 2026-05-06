# Controle de alçada por perfil (5 papéis)

## Papéis
`admin`, `diretor`, `gerente`, `supervisor`, `operador` — substituem o enum `app_role` atual (`admin`, `vendedor`, `operacional`, `financeiro`).

Migração de usuários existentes:
- `admin` → `admin`
- `operacional` → `gerente`
- `vendedor` → `supervisor`
- `financeiro` → `diretor`

## Modelo de permissões (granularidade por campo)

Três tabelas novas:

1. `permission_modules` — catálogo de módulos do app (leads, customers, suppliers, supplier_rates, supplier_documents, quotes, quote_items, bookings, booking_suppliers, packages, itineraries, activities, emails, users, sla_settings, exchange_rates, etc.). Cada módulo declara campos sensíveis (ex.: `quote_items.unit_cost`, `quote_items.markup_pct`, `booking_suppliers.cost`, `supplier_rates.unit_price`).

2. `role_module_permissions` — por (role, module): `can_view`, `can_create`, `can_edit`, `can_delete`, `can_approve`.

3. `role_field_permissions` — por (role, module, field): `can_view`, `can_edit`. Usado para mascarar campos sensíveis (custos, markup, margens) na UI.

Tudo editável em tela; só `admin` (Desenvolvedor) gerencia papéis e a matriz.

## Matriz padrão (semente)

```text
Módulo                  Admin  Diretor  Gerente  Superv.  Operador
Leads                   CRUD   CRUD     CRUD     CRU      RU(seus)
Customers               CRUD   CRUD     CRUD     CRU      R
Quotes                  CRUD   CRUD     CRUD     CRU      R(sem custo)
  .unit_cost/markup     ver    ver      ver      ver      OCULTO
Bookings                CRUD   CRUD     CRUD     CRU      RU
  booking_suppliers.cost ver   ver      ver      ver      OCULTO
Suppliers + rates+docs  CRUD   CRUD     CRUD     R        R
  supplier_rates.cost   ver    ver      ver      OCULTO   OCULTO
Packages/Itineraries    CRUD   CRUD     CRUD     R        R
Activities/Email        CRUD   CRUD     CRUD     CRU      CRU(seus)
Financeiro/Exchange     CRUD   CRUD     R        —        —
SLA settings            CRUD   R        R        —        —
Users + permissões      CRUD   —        —        —        —
```
(R=ver, C=criar, U=editar, D=excluir; livre edição depois pela tela)

## Aplicação

### Backend (RLS)
- Função `has_module_permission(_user_id, _module, _action)` SECURITY DEFINER consulta `user_roles` × `role_module_permissions`.
- Reescrever políticas RLS de cada tabela usando essa função (substituindo `is_admin` / `has_role(...)` específicos).
- Trigger `enforce_field_permissions` em UPDATE: bloqueia mudança de campos sem `can_edit` para o papel do usuário (defesa em profundidade além do mascaramento na UI).
- View `v_quote_items_safe`, `v_booking_suppliers_safe`, `v_supplier_rates_safe` que zera/oculta colunas de custo conforme `role_field_permissions` (consultadas via server function quando o cliente pede dados "mascarados").

### Frontend
- `src/lib/permissions.tsx`: `PermissionsProvider` carrega matriz do usuário 1× no login; expõe `can(module, action)` e `canField(module, field, action)`.
- Hook `useCan()` e componente `<Can module="quotes" action="edit">…</Can>` para esconder botões/menus.
- `<MaskedField module="quote_items" field="unit_cost" value={…} />` que renderiza `•••` quando sem permissão de ver.
- AppShell esconde itens de menu sem `view`.
- Telas existentes (Leads, Quotes, Bookings, Suppliers, Users, Settings, etc.) recebem guards `can(...)` em botões Criar/Editar/Excluir.

### Tela de administração
Nova rota `/settings/permissions` (só `admin`):
- Aba **Papéis**: lista 5 papéis (read-only).
- Aba **Matriz por módulo**: grid Módulo × Papel com checkboxes ver/criar/editar/excluir/aprovar.
- Aba **Campos sensíveis**: por módulo, lista os campos catalogados com checkboxes ver/editar por papel.
- Salvar via server function `updateRolePermissions` (admin-only).

Tela `/users` ganha seleção entre os 5 novos papéis e fica restrita a `admin`.

## Migração SQL (resumo)
1. `ALTER TYPE app_role ADD VALUE 'diretor' / 'gerente' / 'supervisor' / 'operador'`.
2. UPDATE `user_roles` mapeando antigos → novos.
3. Remover valores antigos do enum (recriar enum + cast).
4. Criar 3 tabelas + RLS (só admin gerencia, todos autenticados leem própria matriz).
5. Seed com a matriz padrão acima.
6. Substituir políticas RLS das tabelas de domínio pela nova função.

## Entrega em fases
- **Fase 1**: enum + migração de usuários + tabelas de permissão + seed + função `has_module_permission` + tela `/settings/permissions` + `PermissionsProvider`/`<Can>`.
- **Fase 2**: aplicar `<Can>` e `<MaskedField>` em Leads, Quotes, Bookings, Suppliers, Users, Settings (esconder botões e mascarar custos).
- **Fase 3**: trocar políticas RLS de cada tabela de domínio pela nova função + trigger de campos.
