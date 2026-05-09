## Objetivo
Permitir que Admin/Diretor convidem novos usuários definindo o papel (Diretor, Gerente, Coordenador, Operador), e que o e-mail do convite vire automaticamente a caixa de e-mail principal do usuário (cada um com seu próprio Gmail).

## Situação atual
- A tela `/users` já tem o `InviteDialog` (`src/routes/users.tsx`) que envia `action: "invite"` para a edge function `admin-users` com `email`, `full_name` e `roles[]`.
- A edge `admin-users` já cria o convite via `inviteUserByEmail` e insere os papéis em `user_roles`.
- Enum `app_role` atual: `admin, diretor, gerente, supervisor, operador` (+ legados `vendedor/operacional/financeiro`). **Não existe `coordenador`.**
- Tabela `user_email_accounts` já existe e é usada pela Triagem IA para vincular cada usuário ao(s) seu(s) e-mail(s) Gmail. Hoje o e-mail do convidado **não** é inserido automaticamente lá.

## Mudanças

### 1. Banco — adicionar papel "coordenador" e auto-cadastrar e-mail primário
Migration:
- `ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'coordenador';`
- Atualizar `role_rank()` para posicionar coordenador entre supervisor(1) e gerente(2):
  - admin=5, diretor=4, gerente=3, **coordenador=2**, supervisor=1, operador=0.
- Seed das permissões padrão (`role_module_permissions` / `role_field_permissions`) para `coordenador` (espelhar supervisor por padrão).
- Trigger `on_invite_seed_email_account`: ao criar/confirmar usuário em `auth.users`, se ainda não tem registro em `user_email_accounts`, inserir `(user_id, lower(email), is_primary=true)`. Implementado estendendo `handle_new_user()` para também inserir em `user_email_accounts` (ON CONFLICT DO NOTHING).

### 2. Edge function `admin-users` (`invite` + `resend_invite`)
- Restringir `invite` a `admin` ou `diretor` (já está).
- Validar que `roles` ⊂ `{diretor, gerente, coordenador, operador}` (admin pode atribuir qualquer; diretor não pode atribuir admin/diretor — manter regra atual e adicionar coordenador à allow-list).
- Após `inviteUserByEmail` bem-sucedido, fazer `upsert` em `user_email_accounts (user_id, email_address=lower(email), is_primary=true)` como rede de segurança (caso o trigger não tenha rodado ainda).

### 3. UI `InviteDialog` (`src/routes/users.tsx`)
- Trocar o grid de checkboxes por um **Select de papel único** com opções: Diretor, Gerente, Coordenador, Operador (Diretor escondido para quem não é admin).
- Texto auxiliar abaixo do campo de e-mail: "Este será o endereço da caixa de entrada do usuário no app. A conexão com o Gmail é feita pelo próprio usuário após o primeiro login."
- Manter `email` + `full_name`; enviar `roles: [selectedRole]`.

### 4. i18n
- Adicionar tradução para `coordenador` em `src/lib/i18n.tsx`.

### 5. Lista de papéis no front
- `ROLES` em `src/routes/users.tsx` e `src/lib/auth.tsx` (tipo `AppRole`) incluir `"coordenador"`.
- `src/routes/users_.$userId.permissions.tsx` (matriz de permissões) incluir coluna do coordenador.

## Fora de escopo
- Conexão OAuth do Gmail de cada usuário (já existe fluxo separado via connector Google).
- Mudanças na hierarquia de subordinados além do `role_rank` ajustado.

## Pergunta rápida
Confirma o **rank do Coordenador entre Supervisor e Gerente** (Coordenador > Supervisor)? Se preferir Coordenador < Supervisor, ajusto antes de executar.