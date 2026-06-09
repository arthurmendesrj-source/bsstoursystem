
# Plano: Área de Cobrança com InfinitePay

## Decisões confirmadas
- **Gateway:** InfinitePay (taxas baixas; app controla recorrência)
- **Mensalidade:** Cartão tokenizado — cobrança automática mensal no cartão salvo
- **Top-ups avulsos:** PIX, Boleto ou Cartão (créditos de IA e GB extra de Storage)
- **Destino dos valores:** conta InfinitePay (transferível para Nubank PJ)
- **Acesso ao módulo:** somente owner do tenant
- **Modelo:** Base mensal + R$/usuário adicional + créditos consumíveis (IA tokens, Storage GB-mês)

---

## 1. Banco de dados (1 migration)

Tabelas novas (todas com RLS owner-only, GRANTs para `authenticated` e `service_role`):

- **`billing_plans`** — catálogo: name, monthly_price_cents, included_seats, included_ai_credits, included_storage_gb, extra_seat_price_cents, is_active
- **`billing_customers`** — 1 por tenant: tenant_id, legal_name, doc (CPF/CNPJ), email, phone, address_json, `infinitepay_customer_id`
- **`billing_payment_methods`** — cartões tokenizados: tenant_id, `infinitepay_card_token`, brand, last4, exp_month, exp_year, is_default
- **`billing_subscriptions`** — 1 ativa por tenant: plan_id, seats, status (`active|past_due|canceled|trialing`), current_period_start/end, next_charge_at, payment_method_id
- **`billing_invoices`** (estender existente) — adicionar: subscription_id, period_start, period_end, kind (`subscription|topup`), `infinitepay_charge_id`, payment_method (`card|pix|boleto`), pix_qr, pix_copia_cola, boleto_url, paid_at
- **`billing_credit_wallet`** — saldo por tenant: ai_credits, storage_gb_extra, updated_at
- **`billing_credit_ledger`** — todas movimentações: tenant_id, kind (`grant|consume|topup|expire`), amount, balance_after, reference_type, reference_id, created_at
- **`usage_ai_events`** — por chamada: tenant_id, user_id, feature (`chat|itinerary|email|image`), model, prompt_tokens, completion_tokens, credits_charged, created_at
- **`usage_storage_daily`** — snapshot diário: tenant_id, bucket, bytes, file_count, snapshot_date
- **`billing_topups`** — pedidos avulsos: tenant_id, kind (`ai_credits|storage_gb`), quantity, amount_cents, status, invoice_id

Helper SQL: `is_tenant_owner(_tenant_id, _user_id)` (security definer) + grants.

---

## 2. Backend (TanStack server functions)

**`src/server/infinitepay.server.ts`** — wrapper REST (lê `process.env.INFINITEPAY_*` dentro do `.handler()`):
- `createCustomer`, `tokenizeCard`, `chargeCard` (mensalidade), `createPixCharge`, `createBoletoCharge`, `createCardCharge` (top-up)

**`src/lib/billing.functions.ts`** — todas com `requireSupabaseAuth` + check `is_tenant_owner`:
- `getBillingOverview` — plano atual, próxima cobrança, saldo wallet, % uso
- `getUsageAi` — agregado por período/feature/modelo/usuário
- `getUsageStorage` — por bucket + série diária
- `listInvoices` — paginado, com links PIX/boleto
- `subscribePlan` — cria subscription, tokeniza cartão se preciso, cobra primeira fatura
- `changePlan` / `updateSeats` / `cancelSubscription`
- `updateBillingCustomer`, `savePaymentMethod`, `setDefaultPaymentMethod`, `removePaymentMethod`
- `createTopup` — PIX/Boleto/Cartão para créditos avulsos

**`src/server/ai-meter.server.ts`** — `logAiUsage({tenantId, userId, feature, model, promptTokens, completionTokens})`: grava em `usage_ai_events`, debita `billing_credit_wallet` via ledger.

**Edits:** todas as chamadas Lovable AI existentes (chat, itinerários, emails, imagens) passam a chamar `logAiUsage` após sucesso.

---

## 3. Webhook + cron

**`src/routes/api/public/infinitepay-webhook.ts`** — valida HMAC (`x-signature`), trata eventos:
- `charge.paid` → marca invoice `paid`, se for topup credita wallet via ledger
- `charge.failed` / `charge.refused` → marca invoice `past_due`, marca subscription `past_due` após N tentativas
- `charge.refunded` → estorna ledger
- Idempotente via `infinitepay_charge_id`

**`src/routes/api/public/billing/run-cycle.ts`** — chamado por `pg_cron` diário (apikey header):
- Para cada subscription com `next_charge_at <= now()`: gera invoice do próximo ciclo, chama `chargeCard` no cartão default, agenda retry se falhar
- Reseta créditos inclusos no novo ciclo (mantém top-ups)

**`src/routes/api/public/billing/aggregate-usage.ts`** — diário:
- Soma `storage.objects.metadata->>size` por bucket → `usage_storage_daily`
- Calcula GB-mês acumulado vs incluído; alerta a >80%, debita wallet a 100%

**pg_cron:** 2 jobs diários (`run-cycle` 03:00, `aggregate-usage` 02:00).

---

## 4. Frontend `/billing` (owner-only)

Rota em `src/routes/_authenticated/billing.tsx` com guarda `is_tenant_owner` (redirect + toast se não for).

5 tabs:

1. **Visão geral** — card do plano atual, próxima cobrança (data + valor + cartão), barras de progresso (assentos, IA, Storage) com custo projetado de excedente
2. **Uso de IA** — gráficos (recharts): tokens/dia, por feature, por modelo, top usuários; tabela das últimas 50 chamadas
3. **Uso de Nuvem** — barras por bucket, série diária, alerta de quota
4. **Plano & Assentos** — cards Starter/Pro/Business, input de seats, botão alterar (preview proração)
5. **Pagamentos** — tabela de faturas (status, vencimento, valor, "Ver PIX/Boleto/Recibo"), cartões salvos (gerenciar default, remover), botão **Comprar créditos** (dialog: tipo + quantidade + PIX/Boleto/Cartão), formulário de dados de cobrança (obrigatório p/ boleto)

Componentes: `BillingOverview`, `UsageAiPanel`, `UsageStoragePanel`, `PlanSelector`, `SeatsEditor`, `InvoicesTable`, `PaymentMethodsList`, `AddCardDialog` (iframe/JS SDK da InfinitePay para tokenizar), `TopUpDialog`, `CustomerForm`.

**Menu lateral (AppShell):** item "Cobrança" visível só se owner.

---

## 5. Secrets necessários
- `INFINITEPAY_API_KEY`
- `INFINITEPAY_WEBHOOK_SECRET`
- `INFINITEPAY_ENV` (`sandbox|production`)

Pedidos depois da migration aprovada.

---

## 6. Segurança
- `is_tenant_owner` em todas RLS e em todos os handlers
- Webhook: HMAC com `timingSafeEqual`
- Nenhum dado de cartão no banco — só token + last4 + brand
- `process.env.INFINITEPAY_*` lido só dentro de `.handler()`
- Logs nunca contêm PAN/CVV — só IDs da InfinitePay

---

## 7. Fora de escopo
- PIX recorrente (Pix Automático)
- Split payments
- Conversão de moeda
- Estornos pela UI (faz manual no painel da InfinitePay; webhook reconcilia)

---

## 8. Ordem de implementação
1. Migration (tabelas + RLS + helper + grants)
2. `infinitepay.server.ts` + secrets
3. `billing.functions.ts` + `ai-meter.server.ts`
4. Webhook + 2 endpoints de cron + agendamento pg_cron
5. Rota `/billing` + 5 tabs + componentes
6. Item de menu owner-only
7. Plugar `logAiUsage` em todas as chamadas Lovable AI existentes
8. Seed dos planos base
