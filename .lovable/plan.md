## Objetivo

Quando um admin/diretor enviar convite pela tela de Usuários, o convidado já chega autorizado: clica no link do e-mail, define a senha e entra direto no app sem precisar verificar o e-mail.

## Mudanças

### 1. Auth global — auto-confirmação de e-mail
- Ativar `auto_confirm_email = true` no Auth (via `configure_auth`).
- Mantém `disable_signup = false` e `external_anonymous_users_enabled = false`.
- Ativar `password_hibp_enabled = true` (boa prática de segurança).
- Efeito: novos usuários (incluindo convidados) entram com e-mail já confirmado.

### 2. Edge function `admin-users` — ação `invite`
- Continuar usando `auth.admin.inviteUserByEmail` (envia o e-mail com link mágico para definir senha).
- Após criar o usuário convidado, garantir que esteja confirmado chamando `auth.admin.updateUserById(id, { email_confirm: true })` — redundante com o auto-confirm, mas blindagem caso a config global mude.
- Se nenhum papel for informado em `roles`, atribuir papel padrão **`operador`** automaticamente em `user_roles`.
- Mantém regra atual: diretor não pode atribuir admin/diretor.
- Mantém o upsert em `user_email_accounts` e o `audit log`.

### 3. Sem mudanças de UI
- A tela de Usuários e o modal de convite continuam iguais. O comportamento "já autorizado" é transparente.

## Detalhes técnicos

- Arquivo afetado: `supabase/functions/admin-users/index.ts` (somente bloco `if (action === "invite")`).
- Configuração de Auth via tool `supabase--configure_auth`.
- Sem migração de banco. Sem mudanças em outras ações (block/unblock/delete/list permanecem intactas).
- O link enviado pelo Supabase no convite leva o usuário para a URL de origem (`redirectTo`), onde o app já trata sessão e redireciona para `/dashboard`.

## Fora de escopo

- Reset de senha, alteração de templates de e-mail, mudanças em outras funções do projeto.
