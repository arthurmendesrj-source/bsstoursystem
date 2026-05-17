## Decisões confirmadas
1. **Enterprise**: produto sem price (sob proposta).
2. **Usuário extra**: price recorrente separado no Stripe, cobrado via `quantity` no checkout.
3. **IA excedente / créditos**: cobrança manual fora do Stripe — não criar metered.
4. **Banco de horas adicional (R$ 180/h)**: não aplicar agora.
5. **Migração Completa (faixa)**: não criar no Stripe — proposta manual.

## 1. Migrations (schema)

### 1.1 Estender `plans`
```sql
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS stripe_product_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_id   text,
  ADD COLUMN IF NOT EXISTS included_users    int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_user_cents  int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_extra_user_price_id text,
  ADD COLUMN IF NOT EXISTS description       text,
  ADD COLUMN IF NOT EXISTS features          jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_quote          boolean DEFAULT false;
```

### 1.2 `plan_addons` (recorrentes)
WhatsApp, IA Starter, IA Pro, BI, Banco 10h.
```sql
CREATE TABLE public.plan_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_cents int NOT NULL,
  currency text DEFAULT 'BRL',
  interval text DEFAULT 'month',
  category text,                 -- 'integration' | 'ai' | 'bi' | 'support'
  metadata jsonb DEFAULT '{}',   -- ex: { credits: 1000 }
  stripe_product_id text,
  stripe_price_id text,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.plan_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "addons readable" ON public.plan_addons FOR SELECT USING (true);
CREATE POLICY "addons admin write" ON public.plan_addons FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
```

### 1.3 `plan_one_time` (cobranças únicas)
Setup Essencial/Completo, Setup WhatsApp, Migração Básica. (Migração Completa fica `is_quote=true` sem price.)
```sql
CREATE TABLE public.plan_one_time (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  price_cents int,
  price_min_cents int,
  price_max_cents int,
  currency text DEFAULT 'BRL',
  category text,                 -- 'setup' | 'migration' | 'integration_setup'
  payment_split jsonb DEFAULT '{"upfront_pct":50,"on_delivery_pct":50}',
  stripe_product_id text,
  stripe_price_id text,
  is_active boolean DEFAULT true,
  is_quote boolean DEFAULT false,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.plan_one_time ENABLE ROW LEVEL SECURITY;
CREATE POLICY "one_time readable" ON public.plan_one_time FOR SELECT USING (true);
CREATE POLICY "one_time admin write" ON public.plan_one_time FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));
```

### 1.4 `subscription_addons` (suporte a múltiplos itens por assinatura)
```sql
CREATE TABLE public.subscription_addons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  addon_id uuid REFERENCES public.plan_addons(id),
  quantity int DEFAULT 1,
  stripe_subscription_item_id text,
  added_at timestamptz DEFAULT now()
);
ALTER TABLE public.subscription_addons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub addons by tenant" ON public.subscription_addons FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.id = subscription_id AND public.is_tenant_member(s.tenant_id, auth.uid())
  ));
```

## 2. Seed de dados (via `supabase--insert` após migration)

**`plans`** — desativa `free`/`pro` antigos e insere:
- `essencial` — R$ 1.490, 5 usuários, extra R$ 79.
- `profissional` — R$ 2.990, 12 usuários, extra R$ 99, gmail incluso, **destaque/recomendado**.
- `enterprise` — `is_quote=true`, `price_cents=null`.

**`plan_addons`**:
- `whatsapp` R$ 250 (integration)
- `ia_starter` R$ 490 (ai, metadata `{credits:1000}`)
- `ia_pro` R$ 990 (ai, metadata `{credits:3000}`)
- `bi` R$ 390 (bi)
- `horas_10` R$ 1.500 (support, metadata `{hours:10}`)

**`plan_one_time`**:
- `setup_essencial` R$ 3.500
- `setup_completo` R$ 6.500
- `setup_whatsapp` R$ 1.500
- `migracao_basica` R$ 2.500
- `migracao_completa` `is_quote=true`, price_min 6.000 / price_max 12.000

## 3. Ativar Stripe nativo
`payments--enable_stripe_payments` → cria ambiente test.
Stripe Tax = **sem automação** (BR).

## 4. Espelhar no Stripe (`batch_create_product`)

Recorrentes:
- Essencial + price R$ 1.490/mês BRL + price extra R$ 79/mês (quantity).
- Profissional + price R$ 2.990/mês + extra R$ 99/mês.
- Enterprise: produto **sem price**.
- WhatsApp R$ 250/mês.
- IA Starter R$ 490/mês.
- IA Pro R$ 990/mês.
- BI R$ 390/mês.
- Banco 10h R$ 1.500/mês.

One-time:
- Setup Essencial R$ 3.500.
- Setup Completo R$ 6.500.
- Setup WhatsApp R$ 1.500.
- Migração Básica R$ 2.500.
- Migração Completa: produto **sem price**.

Persistir `stripe_product_id`/`stripe_price_id` (e `stripe_extra_user_price_id` em planos) via UPDATE.

## 5. UI `/billing` (apresentação dos planos e presets Boa/Melhor/Ideal)
- 3 cards de plano com features e CTA "Assinar". Enterprise → "Falar com vendas".
- Seção de add-ons com toggles.
- Seção de serviços únicos (Setup / Migração) — cards com "Contratar".
- 3 presets pré-configurados (Boa / Melhor / Ideal) que selecionam plano + add-ons + setup + migração e abrem checkout.

## 6. Admin `/admin/plans` — expandir
- Aba **Planos** (campos extras).
- Aba **Add-ons** (CRUD).
- Aba **Serviços únicos** (CRUD).
- Botão "Sincronizar com Stripe" por linha.

## 7. Fora desta fase
- `/api/billing/checkout` real (monta line_items com plano + extras + addons + one-time selecionados).
- `/api/billing/portal` (Customer Portal).
- Substituir `src/routes/api/public/billing.webhook.ts` para validar assinatura Stripe e mapear eventos → `subscriptions` + `subscription_addons` + `billing_invoices`.
- Lógica 50/50 para Setup/Migração (estratégia sugerida: 1ª invoice no checkout = 50%, 2ª invoice manual no go-live).

---

Pronto para implementar nesta ordem: **migration → seed → enable Stripe → batch_create_product → UPDATE com ids → UI planos**. Posso começar pela migration?
