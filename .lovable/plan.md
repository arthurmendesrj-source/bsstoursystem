## Objetivo

1. Tirar o botão "Criar empresa / Nova empresa / Cobrança" do cabeçalho (TenantSwitcher) e colocar um único item **Licença** na sidebar, dentro do bloco "Admin" (logo abaixo de **Usuários**, visível apenas para `owner` do tenant ou super admin).
2. Cadastrar/garantir o plano **Profissional** com a regra: **R$ 1.290/mês** incluindo até **12 usuários ativos** + **R$ 99/mês por usuário adicional**, com limite informativo de 150 reservas/mês.
3. Fazer a cobrança mensal usar essa regra (base + extras) automaticamente — sem precisar mexer no plano quando o cliente adiciona/remove gente.

## Mudanças

### 1. Sidebar e header
- **`src/components/AppShell.tsx`**: dentro do bloco `isAdmin` (junto com `/users` e `/security-audit`), adicionar item `Licença` (ícone `Receipt` ou `CreditCard`) apontando para `/billing`. Também aparece para owner mesmo sem `isAdmin` global — usar `tenant.role_in_tenant === "owner" || isAdmin`.
- **`src/components/TenantSwitcher.tsx`**: remover as entradas "Nova empresa" e "Cobrança" do dropdown — passa a servir só para trocar de empresa. O botão grande "Criar empresa" (quando não há nenhuma) continua, pois é o fluxo de onboarding inicial.

### 2. Plano Profissional (uma migração + seed)
A tabela `plans` já tem `included_users` e `extra_user_cents`. Vamos:
- Garantir (via `INSERT … ON CONFLICT (code) DO UPDATE`) o plano com `code='profissional'`:
  - `name`: "Profissional"
  - `price_cents`: 129000
  - `currency`: "BRL", `interval`: "month", `trial_days`: 7
  - `included_users`: 12
  - `extra_user_cents`: 9900
  - `features`: `{ "bookings_per_month": 150, "gmail_integration": true, "advanced_permissions": true, "advanced_reports": true }`
  - `is_active`: true, `is_public`: true, `sort_order`: 10
- Desativar (`is_public=false`) outros planos públicos que estejam mascarando esse como default — sem deletar.

### 3. Cálculo do valor mensal
- **`src/routes/api/public/billing/run-cycle.ts`**: ao criar a fatura mensal da assinatura, calcular:
  ```text
  active_users = count(tenant_members WHERE tenant_id=? AND is_active=true)
  extras       = max(0, active_users - plan.included_users)
  amount_cents = plan.price_cents + extras * plan.extra_user_cents
  ```
  Salvar `active_users` e `extras` no `metadata` da fatura para histórico.
- Aplicar o mesmo cálculo no retry e na exibição de "próxima cobrança".

### 4. UI da página /billing
- **`src/routes/billing.tsx`** (aba *Visão geral*): incluir um card "Usuários da licença" mostrando `ativos / incluídos`, quantos são extras, e o **total estimado** do próximo ciclo (`base + extras × valor_extra`). Texto: "12 incluídos · R$ 99 por extra".

### 5. Não vamos mexer (escopo fora)
- Permissões por usuário, limite real de reservas (150/mês é só informativo no plano agora), Stripe IDs, outros planos legados.

## Detalhes técnicos

- Migração só faz `INSERT … ON CONFLICT (code)` e `UPDATE plans SET is_public=false WHERE code <> 'profissional' AND is_public = true` (reversível: basta reativar manualmente).
- `extras` é calculado a partir de `tenant_members.is_active=true`. Owner conta como 1 usuário.
- O retry/grace continua funcionando — só muda o `amount_cents` calculado antes do charge.
- Nenhuma nova rota é criada. `Link` para `/billing` já existe via route file.

## Pergunta aberta

Quando o owner adicionar o 13º usuário **no meio do mês**, devemos:
- (A) cobrar proporcional já agora (gera fatura pequena de "ajuste"), ou
- (B) só passar a contar no próximo ciclo mensal (mais simples, padrão do plano).

Vou seguir com **(B)** salvo se você preferir (A).
