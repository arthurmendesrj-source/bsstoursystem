## Objetivo

Eliminar a tela "Criar empresa". Ao fazer login, se o usuário ainda não tem nenhuma empresa, o sistema cria uma automaticamente e leva direto ao dashboard.

## O que vou alterar

### 1. `src/lib/tenant.tsx` — criação automática
No `load()` do `TenantProvider`, quando `memberships` vier vazio (e o usuário não for super-admin):

1. Buscar `full_name` em `profiles` (fallback: parte do email antes do `@`, ou "Minha Empresa").
2. Gerar slug a partir desse nome + sufixo curto do `user.id` (ex.: `joao-silva-a1b2c3`) para evitar colisão.
3. `insert` em `public.tenants` com `created_by = user.id`, `status = 'active'`.
4. `insert` em `public.tenant_members` com `role_in_tenant = 'owner'`, `is_active = true`.
   (O trigger `create_trial_subscription_for_tenant` já cria a assinatura trial de 30 dias.)
5. Releitura das memberships e seguir o fluxo normal.

Em caso de erro (ex.: corrida), reler memberships antes de desistir; se ainda vazio, mostrar toast e manter o usuário onde está (sem redirect para `/onboarding`).

### 2. Remover redirect para onboarding
Em `TenantProvider`, tirar o bloco que faz `navigate({ to: "/onboarding" })` quando `tenants.length === 0`. Após a auto-criação, sempre haverá tenant.

### 3. `src/routes/index.tsx`
Já redireciona logado → `/dashboard`. Nenhuma mudança necessária.

### 4. `src/routes/onboarding.tsx`
Manter o arquivo (para não quebrar imports/rota gerada), mas torná-lo um redirect simples para `/dashboard` — assim nenhum link antigo cai numa tela morta.

## O que NÃO vou mexer

- Schema do banco (tabelas, RLS, triggers permanecem).
- Billing/assinatura — trial de 30 dias continua sendo criado pelo trigger.
- Fluxo de troca de empresa (`/t/$tenantSlug`) e super-admin.
- Gate de assinatura bloqueada (`past_due`, `canceled` etc.) continua redirecionando para `/billing`.

## Riscos / observações

- Slug duplicado: mitigado pelo sufixo do `user.id`. Se ainda assim colidir, faço retry com sufixo aleatório curto.
- Usuários que hoje já têm o caminho `/onboarding` aberto: passam a ser levados ao dashboard automaticamente.
