
# Plano — Área de Cobrança (`/billing`)

Modelo: **base mensal + R$/usuário adicional + cr&eacute;ditos de Storage (GB-mês) e IA (tokens)**. Gateway: **Stripe (integrado Lovable)**. Acesso: somente **owner** do tenant.

## 1. Banco de dados (migration)

Aproveita o que já existe (`tenants`, `subscriptions`, `plans`, `billing_invoices`, `plan_addons`) e adiciona o que falta para medição/uso.

Novas tabelas (todas com RLS, somente owner do tenant lê via `has_role`/`tenant_members.role_in_tenant = 'owner'`; writes = `service_role`):

- `ai_usage_log` — `tenant_id`, `user_id`, `model`, `feature` (triage/proposal/assistant/etc.), `input_tokens`, `output_tokens`, `cost_credits`, `meta jsonb`, `created_at`. Índice por `(tenant_id, created_at)`.
- `storage_usage_daily` — `tenant_id`, `day date`, `bucket`, `bytes bigint`, `objects int`. PK `(tenant_id, day, bucket)`. Alimentada por job diário que soma `storage.objects.metadata->>size`.
- `billing_usage_periods` — `tenant_id`, `subscription_id`, `period_start`, `period_end`, `ai_tokens_input`, `ai_tokens_output`, `ai_credits_used`, `storage_gb_avg`, `seats_avg`, `status` (open/closed/invoiced), `invoice_id`. Fechado no fim do ciclo, vira `billing_invoices`.
- `payment_methods` — `tenant_id`, `stripe_customer_id`, `stripe_payment_method_id`, `brand`, `last4`, `exp_month/year`, `is_default`.
- `billing_credits_ledger` — `tenant_id`, `kind` (ai|storage), `delta_credits numeric`, `reason`, `ref_id`, `created_at`. Para top-ups avulsos e ajustes.

Colunas adicionais:
- `tenants.stripe_customer_id text`
- `subscriptions.stripe_subscription_id text`, `seats int default 1`, `included_ai_credits int`, `included_storage_gb int`
- `plans` ganha `price_per_seat_cents`, `included_ai_credits`, `included_storage_gb`, `overage_ai_credit_cents`, `overage_storage_gb_cents`

Todas seguem a regra GRANT → ENABLE RLS → POLICY.

## 2. Backend (server fns + 1 webhook)

`src/lib/billing.functions.ts` (todos com `requireSupabaseAuth` + checagem `is_owner(tenant_id)`):
- `getBillingOverview` — plano atual, assentos, cartão default, próximo vencimento, uso do período corrente (IA + storage + assentos) com % consumido.
- `getUsageBreakdown({ range })` — séries diárias de tokens IA (por feature/user) e GB de storage (por bucket). Alimenta gráficos.
- `getInvoices` / `getInvoicePdfUrl(id)` — lista e link Stripe-hosted.
- `changePlan({ planId })`, `updateSeats({ seats })`, `cancelSubscription()`, `resumeSubscription()`.
- `createCheckoutSession({ planId, seats })` — Stripe Checkout para nova assinatura.
- `createBillingPortalSession()` — redirect ao portal Stripe (gerenciar cartão).
- `topUpCredits({ kind, amount })` — checkout one-shot para pacote de créditos.

`src/server/billing.server.ts` — wrapper do SDK Stripe (server-only, importado via `await import` dentro dos handlers).

`src/server/ai-meter.server.ts` — helper `logAiUsage(...)` chamado em **todas** as chamadas existentes ao Lovable AI (assistant, triage, propose-tour, transcribe, generate-doc, extract-supplier-*). Lê `usage.input_tokens/output_tokens` da resposta e grava em `ai_usage_log`.

Rota pública: `src/routes/api/public/stripe/webhook.ts` — verifica assinatura `STRIPE_WEBHOOK_SECRET`, processa `customer.subscription.*`, `invoice.paid`, `invoice.payment_failed`, `checkout.session.completed`. Usa `supabaseAdmin` para atualizar `subscriptions`, `billing_invoices`, `payment_methods`, `billing_credits_ledger`.

Cron diário (pg_cron + `/api/public/billing/aggregate`) consolida `storage.objects` → `storage_usage_daily` e fecha período de assinaturas vencidas → reporta uso ao Stripe (`subscription_item.usage_record`).

## 3. Frontend — `/billing` (owner-only)

Rota `src/routes/billing.tsx` já existe (gate de assinatura). Vamos transformá-la em hub com abas:

1. **Visão geral** — card do plano atual, próximo vencimento, status, botões "Mudar de plano" / "Gerenciar cartão" (portal Stripe). Cards de uso (IA, Storage, Assentos) com barras de progresso `usado / incluído` e custo projetado de excedente.
2. **Uso & Créditos** (componente novo `UsageDashboard.tsx`):
   - Gráficos (recharts) de tokens IA por dia, separados por feature e top-5 usuários.
   - Gráfico de GB de storage por bucket.
   - Tabela "últimas 50 chamadas de IA" com modelo, feature, tokens, custo.
   - Botões **"Comprar créditos IA"** e **"Comprar pacote de Storage"** (top-ups).
3. **Assinatura** — seletor de plano (cards Starter/Pro/Business com preço por assento e cotas), input de assentos, preview de novo total, botão "Aplicar".
4. **Faturas** — tabela (`billing_invoices` + Stripe) com download PDF e status.
5. **Método de pagamento** — cartão default; abre Stripe Billing Portal.

Sidebar (`AppShell`): novo item "Cobrança" visível só para owner (`tenant.role_in_tenant === 'owner'`). Membros que tentarem acessar veem aviso "Apenas o proprietário pode ver cobrança".

## 4. Stripe — setup

Antes de codar:
1. Rodar `recommend_payment_provider` (esperado: Stripe, SaaS).
2. `enable_stripe_payments` (cria conta sandbox automática).
3. Criar produtos via `batch_create_product`: 3 planos base + add-on "Assento adicional" (per-seat metered) + 2 metered products "AI tokens" e "Storage GB-mês" + 2 one-time "Pacote 10k créditos IA" e "Pacote 10 GB".

## 5. Segurança

- `is_owner(tenant_id)` policy helper. Todas as policies de billing exigem owner.
- Webhook valida assinatura HMAC antes de qualquer write.
- `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` via `add_secret` (passo após enable).
- Nenhum endpoint `/api/public/*` retorna PII; webhook só usa IDs do Stripe.

## 6. Fora deste escopo

- Cobrança em PIX/boleto (gateway separado).
- Visualização de consumo por membro comum (só owner por enquanto).
- Conversão automática real→USD; preços ficam em BRL via Stripe.
- Refunds automáticos (feito manualmente no Stripe Dashboard).

## Arquivos a criar/editar

- **Criar**: migration; `src/lib/billing.functions.ts`; `src/server/billing.server.ts`; `src/server/ai-meter.server.ts`; `src/routes/api/public/stripe/webhook.ts`; `src/routes/api/public/billing/aggregate.ts`; `src/components/billing/UsageDashboard.tsx`; `src/components/billing/PlanSelector.tsx`; `src/components/billing/InvoicesTable.tsx`; `src/components/billing/TopUpDialog.tsx`.
- **Editar**: `src/routes/billing.tsx` (transformar em hub); `src/components/AppShell.tsx` (item de menu owner-only); todas as chamadas existentes ao Lovable AI para chamar `logAiUsage`.
