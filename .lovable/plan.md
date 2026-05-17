# Plano: Multi-tenant (SaaS por empresa) + Módulo de Cobrança

## Visão geral

Transformar o app atual num SaaS multi-tenant:
- **Um único banco**, com isolamento por `tenant_id` em todas as tabelas + **RLS** no Postgres.
- **Acesso por path agora** (`/t/{slug}/...`) e estrutura pronta para subdomínio depois (`empresa.seuapp.com`).
- **Super-admin global** (você) com acesso a tudo; demais dados migrados para um tenant `default`.
- **Módulo de cobrança**: tabelas de planos / assinaturas / status agora; integração com gateway (Stripe) depois.
- Bloqueio de acesso ao app quando assinatura não estiver `active` (mostra tela de cobrança).

---

## 1. Modelo de dados (migração SQL)

### 1.1 Novas tabelas

- **`tenants`** — empresa assinante
  - `slug` (único, usado na URL), `name`, `status` (`active` / `suspended` / `canceled`), `created_by`
- **`tenant_members`** — vínculo usuário ↔ tenant
  - `tenant_id`, `user_id`, `role_in_tenant` (`owner` / `admin` / `member`), `is_active`
- **`tenant_domains`** (preparação futura para subdomínio)
  - `tenant_id`, `host`, `is_primary`
- **`plans`** — planos de assinatura
  - `code`, `name`, `price_cents`, `currency`, `interval` (`month` / `year`), `features` (jsonb), `is_active`
- **`subscriptions`** — assinatura por tenant
  - `tenant_id` (único), `plan_id`, `status` (`trialing` / `active` / `past_due` / `canceled`), `current_period_end`, `trial_end`, `gateway`, `gateway_customer_id`, `gateway_subscription_id`
- **`invoices`** — histórico de cobranças
  - `tenant_id`, `subscription_id`, `amount_cents`, `currency`, `status`, `due_date`, `paid_at`, `gateway_invoice_id`
- **`super_admins`** — quem é super-admin global do SaaS
  - `user_id` (único)

### 1.2 Adicionar `tenant_id` nas tabelas de negócio existentes

Adicionar coluna `tenant_id uuid` (nullable inicialmente para a migração) em todas as tabelas de domínio do CRM: `leads`, `customers`, `suppliers`, `bookings`, `proposals`, `activities`, `emails`, `tasks`, `notifications`, `whatsapp_*`, `proposal_*`, `booking_*`, `supplier_*`, `user_email_accounts`, `user_module_permissions`, `user_field_permissions`, etc.

> Vou levantar a lista exata varrendo o schema antes da migração; nenhuma tabela de negócio fica de fora.

### 1.3 Backfill (migrar dados atuais)

1. Criar tenant `default` (slug `default`).
2. Atribuir `tenant_id = default` em todas as linhas existentes de todas as tabelas de negócio.
3. Para cada usuário existente: criar `tenant_members` ligando ao tenant `default` (role `member`; admins atuais viram `owner`).
4. Tornar `tenant_id` `NOT NULL` após backfill.
5. Marcar o usuário admin atual como `super_admin`.
6. Criar `subscription` `active` para o tenant `default` no plano "Free interno" para não bloquear acesso.

### 1.4 Funções e RLS

- Função `public.current_tenant_id()` (security definer) — lê o tenant da sessão (via JWT claim `tenant_id` setado no login no tenant, ou via fallback consultando `tenant_members`).
- Função `public.is_super_admin(uuid)` — checa `super_admins`.
- Função `public.is_tenant_member(uuid, uuid)` — checa membership.
- **Políticas RLS** em TODAS as tabelas com `tenant_id`:
  - `SELECT/INSERT/UPDATE/DELETE USING (tenant_id = public.current_tenant_id() OR public.is_super_admin(auth.uid()))`
  - Para `INSERT`, `WITH CHECK` força `tenant_id = current_tenant_id()`.
- RLS em `tenants`, `tenant_members`, `subscriptions`, `invoices`, `plans` com regras específicas (membros leem seu tenant; super-admin vê tudo; `plans` é leitura pública para autenticados).

### 1.5 Trigger de proteção

Trigger `BEFORE INSERT` em todas as tabelas tenant-scoped que injeta `tenant_id = current_tenant_id()` quando NULL, evitando bugs de aplicação.

---

## 2. Frontend — roteamento por tenant

### 2.1 Estrutura de rotas

Reorganizar todas as rotas autenticadas do app sob um layout `/t/$tenantSlug`:

```text
src/routes/
  _authenticated.tsx              -> gate de login (já existe lógica)
  t.$tenantSlug.tsx               -> layout do tenant (resolve slug -> tenantId, valida membership, valida subscription, fornece TenantContext)
  t.$tenantSlug.dashboard.tsx
  t.$tenantSlug.leads.tsx
  t.$tenantSlug.customers.tsx
  ... (todas as rotas atuais movidas para baixo de t.$tenantSlug.*)
  billing.tsx                     -> tela de cobrança (acessível mesmo com subscription past_due)
  admin.tenants.tsx               -> super-admin: lista de tenants
  admin.tenants.$tenantId.tsx     -> super-admin: detalhe/edição
  onboarding.tsx                  -> primeira criação de tenant
```

> Como o app já tem MUITAS rotas (settings, alerts, suppliers, bookings, etc.), o ajuste prático será: manter os arquivos com seus nomes, mas o **layout `t.$tenantSlug.tsx`** carrega o contexto do tenant e o `AppShell` já existente passa a usar `useTenant()` para montar links com prefixo `/t/{slug}/...`.

### 2.2 Resolução do tenant

- Layout `t.$tenantSlug.tsx`:
  1. `beforeLoad` valida sessão (já existente).
  2. `loader` chama server fn `resolveTenant({ slug })` que retorna `{ tenantId, role, subscriptionStatus, planFeatures }`.
  3. Se usuário não é membro → 403 "Você não tem acesso a esta empresa".
  4. Se `subscriptionStatus` ∈ {`past_due`, `canceled`} → redireciona para `/billing` (com `tenantId` no contexto).
  5. Provê `TenantContext` para toda a subárvore.

### 2.3 AppShell

- Sidebar lê `useTenant()` e gera todos os `<Link>` com `params={{ tenantSlug }}`.
- Mostra nome da empresa no topo e seletor "Trocar empresa" se o usuário pertence a mais de um tenant.
- Item "Cobrança" visível apenas para `owner`/`admin` do tenant.
- Item "Admin do SaaS" visível apenas para super-admin (lista de tenants, assinaturas, etc.).

### 2.4 Server functions

- Todas as server fns existentes (`*.functions.ts`) passam a:
  - Ler `tenantId` do contexto (via header `x-tenant-id` enviado pelo client ou via claim na sessão).
  - Validar membership via `is_tenant_member`.
  - RLS é o backstop, mas a validação explícita melhora mensagens de erro.
- Adicionar middleware `requireTenantMember` que estende `requireSupabaseAuth`.

---

## 3. Onboarding

Fluxo `/onboarding` (acessível após login quando usuário não tem nenhum tenant):
1. Nome da empresa + slug desejado (validação de unicidade e formato `[a-z0-9-]`).
2. Escolha do plano (lista de `plans`, com possibilidade de "Trial 14 dias").
3. Cria `tenants` + `tenant_members` (role `owner`) + `subscriptions` com status `trialing` (ou `active` para plano free).
4. **Cobrança fica pendente** — gateway será conectado depois; por ora a assinatura é criada localmente.
5. Redireciona para `/t/{slug}/dashboard`.

---

## 4. Módulo de cobrança (sem gateway ainda)

### 4.1 Telas

- **`/billing`** (escopo do tenant atual): mostra plano atual, status, próximo vencimento, lista de invoices, botão "Alterar plano".
- **`/admin/tenants`** (super-admin): lista de tenants, status de cada assinatura, permite suspender/reativar manualmente.
- **`/admin/plans`** (super-admin): CRUD de planos.

### 4.2 Lógica

- Server fns para listar plano, mudar plano, listar invoices, marcar invoice como paga (manual por super-admin enquanto não há gateway).
- Hook `useSubscriptionGate()` no layout de tenant que redireciona para `/billing` quando status não permite uso.
- Estrutura pronta para receber webhooks do gateway depois (campos `gateway`, `gateway_customer_id`, `gateway_subscription_id`, `gateway_invoice_id` já existem).

### 4.3 Preparação para gateway futuro (Stripe)

- Server route `src/routes/api/public/billing/webhook.ts` criado como **stub** que valida assinatura HMAC e roteia eventos `invoice.paid`, `subscription.updated`, etc. Implementação real do gateway fica para uma próxima iteração.

---

## 5. Subdomínio futuro (preparação, não implementação agora)

- Tabela `tenant_domains` já criada.
- Helper `resolveTenantFromHost(host)` no server stub: lê host, consulta `tenant_domains`. Não está ligado às rotas ainda — quando você quiser ligar subdomínios, basta:
  1. Configurar DNS wildcard + custom domain no Lovable.
  2. Trocar o `loader` de `t.$tenantSlug.tsx` por resolução via host.
  3. Roteamento por path continua funcionando como fallback.

---

## 6. Detalhes técnicos

- **Claim de tenant na sessão**: o backend não consegue setar JWT custom claims sem hook no Supabase Auth. Solução pragmática: client envia `x-tenant-id` em todo server-fn call (via `attachSupabaseAuth` estendido), e `current_tenant_id()` lê de uma GUC setada por uma server fn de "switch tenant" + validação por `tenant_members`. Alternativa mais simples: passar `tenantId` explícito em cada server fn e validar membership.
- **Realtime**: canais Supabase passam a filtrar por `tenant_id` no client.
- **Storage**: prefixar paths com `tenant_id/...` em todos os buckets (`proposal-docs`, `booking-proofs`, etc.) e adicionar policies de storage por tenant.
- **i18n / config.toml / Lovable Cloud**: nada muda.

---

## 7. Ordem de execução (proposta)

1. **Migração SQL** (tenants, members, plans, subscriptions, invoices, super_admins, `tenant_id` em todas as tabelas, backfill, RLS, triggers).
2. **TenantContext + layout `t.$tenantSlug.tsx`** + `AppShell` adaptado.
3. **Atualizar todas as server fns** para validar membership + propagar `tenant_id`.
4. **Onboarding** (`/onboarding`).
5. **Módulo de cobrança** (telas billing + admin de tenants/planos, sem gateway).
6. **Storage** scoping por tenant.
7. **Stub de webhook** para gateway futuro.

---

## 8. Fora de escopo (agora)

- Integração real com Stripe / Mercado Pago / Pagar.me.
- Subdomínio por empresa (estrutura pronta, mas não ligada).
- Suporte a múltiplos tenants por usuário com troca rápida (vou criar a base, mas a UX refinada de "trocar empresa" pode ser melhorada depois).
- Migração granular de permissões existentes (`user_module_permissions` / `user_field_permissions`) — vão ganhar `tenant_id` mas a UI de gestão continua igual.
- Faturamento por uso / métricas / cobrança variável.

---

## Pergunta antes de implementar

Esse plano é grande (toca em quase todo o schema e em todas as rotas). Confirma:
1. **Slug do tenant default** para a migração: `default` está OK, ou prefere outro (`bsstour`, `principal`)?
2. **Plano inicial** para o tenant default: crio um plano `interno` invisível (acesso ilimitado, sem cobrança) — OK?
3. **Trial padrão** nos novos cadastros: 14 dias soa bem, ou prefere outro número (7 / 30 / sem trial)?

Se confirmar esses 3 pontos, sigo executando na ordem do item 7.
