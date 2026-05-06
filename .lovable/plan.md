## Objetivo
Ao clicar no nome de um usuário em `/users`, abrir a tela de **permissões daquele usuário específico**, permitindo configurar/editar o acesso individual (override sobre o que o papel já dá).

## Modelo de dados (override por usuário)

Hoje as permissões são só por papel (`role_module_permissions` + `role_field_permissions`). Vou adicionar duas novas tabelas de override individual:

- **`user_module_permissions`** — `user_id`, `module_key`, `can_view`, `can_create`, `can_edit`, `can_delete`, `can_approve`. Cada coluna booleana é nullable: `null` = "herda do papel", `true/false` = override explícito.
- **`user_field_permissions`** — `user_id`, `module_key`, `field_key`, `can_view` (nullable), `can_edit` (nullable). Mesma lógica de herança.

RLS:
- Admin gerencia tudo.
- Usuário lê apenas as próprias linhas.

Função SQL `has_module_permission` será atualizada para considerar override individual primeiro; se `null`, cai no papel; admin sempre passa.

## Mudanças no frontend

1. **`/users`** — nome do usuário vira link → navega para `/users/$userId/permissions`.
2. **Nova rota `/users/$userId/permissions`** (admin-only):
   - Header: nome + papéis atuais do usuário.
   - Aba "Por módulo" e "Campos sensíveis", mesmo layout da matriz atual, mas com **3 estados** por checkbox:
     - **Herdado do papel** (cinza/indeterminado, mostra valor calculado)
     - **Permitir** (✓ override)
     - **Bloquear** (✗ override)
   - Botão "Resetar para o papel" por linha (apaga override).
   - Mesma lógica de **edit-gating**: o editor não pode conceder o que ele próprio não tem.
3. **`src/lib/permissions.tsx`** — `PermissionsProvider` carrega também os overrides do usuário logado e aplica precedência: admin > override individual > papel.

## Detalhes técnicos

- Migration cria as 2 tabelas + RLS + atualiza `has_module_permission(user, module, action)` para checar `user_module_permissions` antes de `role_module_permissions`.
- Nova função `has_field_permission(user, module, field, action)` (caso ainda não exista) com mesma lógica de precedência.
- Componente `<GatedTriCheckbox>` substitui `<GatedCheckbox>` na nova rota; ciclo de clique: herdado → permitir → bloquear → herdado.
- `/users` ganha `<Link to="/users/$userId/permissions">` no nome (ícone de engrenagem ao lado também).

## Fora de escopo
- Não muda `/settings/permissions` (continua sendo a matriz por papel = padrão).
- Não muda papéis dos 4 usuários simulados — você continua atribuindo em `/users`.
- Não cria UI de auditoria de overrides (já existe `/permissions-audit` que pode ser estendido depois).
