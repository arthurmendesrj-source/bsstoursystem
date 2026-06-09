## Fluxo desejado

1. **Cadastro** → cliente cria conta.
2. **Trial automático**: 30 dias grátis no pacote básico (Profissional, plano público mais completo, ou definimos um plano "trial").
3. **Após o trial** → cliente entra na aba **Licença** e:
   - assina um **pacote** (Profissional, etc.) ou a **Assinatura Avulsa** (1 usuário).
4. **Uso de IA** e **armazenamento na nuvem** continuam cobrados à parte (top-ups / overage).

---

## Mudanças no banco (1 migração)

1. Definir o plano de trial padrão:
   - Renomear/marcar `pro` como `trial` ou criar plano `trial` (R$ 0, 30 dias, recursos básicos) com `is_public=false` e `trial_days=30`.
   - Atualizar todos os planos públicos (`profissional`, `avulso`) para `trial_days=0`.
2. Trigger `on_tenant_created`:
   - Quando uma `tenants` é inserida, criar automaticamente uma `subscriptions` com `plan_id = trial`, `status = 'trialing'`, `trial_end = now() + 30 dias`.
3. Função `is_trial_active(tenant)` e atualização de `is_tenant_billing_blocked` para bloquear acesso quando trial expirou e não há plano pago.

## Mudanças na aba `/billing` (Licença)

Arquivo: `src/routes/billing.tsx`

1. **Banner de status no topo**:
   - Se `status='trialing'`: "Você está no período de teste — faltam X dias. Assine um pacote antes do fim do trial para continuar usando."
   - Se `status='active'`: "Pacote atual: NOME — próxima cobrança em DATA."
   - Se `status='past_due'/'suspended'`: aviso vermelho + CTA para regularizar.

2. **Seção "Pacotes"** (sempre visível, mesmo sem tenant selecionado):
   - Cards: Profissional, Avulso (Individual) — e qualquer outro `is_public=true`.
   - Botão "Assinar" em cada card → chama `changeSubscriptionPlan` e abre cobrança (cartão/pix/boleto via InfinitePay já implementado).
   - Destaque "Plano atual" no card assinado.

3. **Seção "Uso de IA" e "Armazenamento" (separadas do pacote)**:
   - Já existem (`AiUsageTab`, `StorageUsageTab`).
   - Adicionar nota: "Cobrado separadamente — recarga avulsa quando passar do incluso".
   - Botão "Comprar créditos de IA" / "Comprar GB extra" via `createTopup` (já existe).

4. **Remover "Criar empresa"** da página (já feito).

## Mudanças na assinatura/onboarding

Arquivo: `src/routes/onboarding.tsx`

- Reduzir a tela para apenas pedir o **nome da empresa** (sem escolher plano).
- Após criar a tenant, o trigger cria o trial de 30 dias automaticamente.
- Redirecionar para o dashboard com toast: "Sua conta tem 30 dias grátis. Veja em Licença para escolher um pacote."

## Gate de acesso após trial expirar

- Componente `BillingAccessGate` (já existe) passa a bloquear rotas quando `is_tenant_billing_blocked = true`, mostrando tela "Seu período de teste acabou — escolha um pacote" com link direto para `/billing`.

---

## Pontos a confirmar antes de implementar

- **Plano de trial**: usar o `Profissional` como base do trial (todos os recursos liberados por 30 dias) ou criar um plano "Básico Trial" mais limitado?
- **Após expirar o trial sem assinar**: bloquear tudo exceto a aba Licença, ou apenas mostrar banner persistente?
- **Pagamento**: manter InfinitePay (já integrado) para cartão/pix/boleto?
