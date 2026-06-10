
## Objetivo

- `diretorturismos@gmail.com` (Diretor1) deve ter alçada total agora.
- Toda nova conta criada via cadastro direto (signup público) vira **conta master**: tenant próprio + papel `admin`.
- Toda conta criada via **convite** fica vinculada ao tenant de quem convidou (subordinada).

## Situação atual (verificada no banco)

- Diretor1 existe em `auth.users` e `profiles`, mas **não tem nenhum papel em `user_roles` e nenhum tenant em `tenant_members`** — por isso não tem acesso a nada.
- O trigger `handle_new_user` hoje só cria `profiles` + `user_email_accounts`. Não cria tenant nem papel.
- O edge function `admin-users` (ação `invite`) cria o usuário convidado e atribui papéis, mas **não o vincula ao tenant do convidador**.

## O que será feito

### 1. Conserto pontual do Diretor1 (dados, agora)

- Criar um tenant "Diretor1" (slug `diretor1` ou derivado do nome) com `created_by = id do Diretor1`.
- Inserir `tenant_members(tenant_id, user_id, role_in_tenant='owner', is_active=true)`.
- Inserir em `user_roles` os papéis `admin` **e** `diretor` para o user_id do Diretor1 (admin garante alçada total no app; diretor habilita as telas que checam `isDirector`).
- O trigger existente `trg_create_trial_subscription` já cria a assinatura trial automaticamente quando o tenant nasce.

### 2. Signup direto → conta master automática (migração de schema)

Substituir `public.handle_new_user()` para, além do que já faz, quando o novo usuário **não** veio de convite:

- Detectar convite por `NEW.invited_at IS NOT NULL` ou pela flag `NEW.raw_user_meta_data ? 'invited_by_tenant_id'` (que a edge function vai passar — ver item 3). Se qualquer um dos dois indicar convite, **não** cria tenant nem papel master.
- Caso contrário (signup público):
  - `INSERT INTO public.tenants(name, slug, created_by)` usando `full_name` (ou email) como nome e um slug único.
  - `INSERT INTO public.tenant_members(tenant_id, user_id, role_in_tenant='owner', is_active=true)`.
  - `INSERT INTO public.user_roles(user_id, role)` com `'admin'` e `'diretor'`.

O trigger continua `SECURITY DEFINER` para conseguir escrever em `tenants`, `tenant_members` e `user_roles`.

### 3. Convite herda o tenant do convidador (edge function `admin-users`)

Em `supabase/functions/admin-users/index.ts`, ação `invite`:

- Antes de chamar `inviteUserByEmail`, resolver o `tenant_id` do convidador via `tenant_members` (membership ativa do `callerId`). Se o convidador não tiver tenant, devolver erro claro.
- Passar `data: { ..., invited_by_tenant_id: <tenant_id>, invited_by_user_id: <callerId> }` na chamada de `inviteUserByEmail` — isso vira `raw_user_meta_data` do novo `auth.users` e é o sinal que o trigger usa para **não** criar tenant novo.
- Após o convite, inserir no banco:
  - `tenant_members(tenant_id=<tenant do convidador>, user_id=<invited.user.id>, role_in_tenant='member', is_active=true)`.
- Os papéis em `user_roles` continuam sendo atribuídos como hoje (padrão `operador`, ou os papéis selecionados; diretor continua impedido de conceder `admin`/`diretor`).

### 4. Validação

- Logar com `diretorturismos@gmail.com` e confirmar que aparece o painel completo (admin + diretor).
- Criar um novo signup direto com outro e-mail → conferir que nasceu com tenant próprio, virou owner e tem `admin`.
- A partir do Diretor1, convidar outro e-mail → conferir que o convidado entra no **mesmo tenant** do Diretor1 (não cria tenant novo) e fica com o papel solicitado.

## Detalhes técnicos

- Geração de slug do tenant no trigger: `public.slugify_text(coalesce(full_name, split_part(email,'@',1)))` + sufixo aleatório se já existir.
- `handle_new_user` precisa tratar `ON CONFLICT DO NOTHING` em todos os inserts para ser idempotente (caso o trigger rode mais de uma vez).
- A inserção em `user_roles` usa o enum `app_role` existente (`admin`, `diretor`, ...).
- Nenhuma policy RLS de `tenants`/`tenant_members`/`user_roles` precisa mudar — o trigger roda como definer e o edge function usa service role.
- Nada muda no fluxo de `/licenca`: o código `BOSCO1` continua ativando a assinatura do tenant do usuário (que agora sempre existirá).
