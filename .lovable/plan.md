# Plano Avulso (R$150) + reservas ilimitadas no Profissional

## 1. Seed/atualização de planos (migration)

Atualizar tabela `plans`:

- **Profissional** (`code='profissional'`): manter `price_cents=129000`, `included_users=12`, `extra_user_cents=9900`. Em `features`, **remover** `bookings_per_month` (ou setar `null`) e adicionar `bookings_unlimited=true`. Demais features mantidas.
- **Avulso** (`code='avulso'`): inserir/upsert com
  - `name='Avulso'`
  - `price_cents=15000` (R$ 150,00)
  - `included_users=1`
  - `extra_user_cents=15000` (usuário extra também R$150)
  - `features={ bookings_per_month: 30, gmail_integration: false, advanced_permissions: false, advanced_reports: false }` (limite mantido fora do Profissional — confirmar valor; sugestão 30)
  - `is_public=true`, `sort_order=5` (aparece antes do Profissional)

## 2. Cálculo de cobrança (`src/routes/api/public/billing/run-cycle.ts`)

Nenhuma mudança estrutural: a fórmula já é
`price_cents + max(0, activeUsers - included_users) * extra_user_cents`,
que funciona naturalmente para Avulso (1 incluso, extras a R$150).

## 3. UI — página de Licença (`src/routes/billing.tsx`)

No card "Usuários da licença":
- Se `features.bookings_unlimited === true`, exibir badge "Reservas ilimitadas" em vez do número.
- Caso contrário, exibir `features.bookings_per_month` como hoje.

(Sem mudanças em seleção de plano por ora — o tenant continua com o plano atribuído; troca de plano fica fora deste escopo.)

## 4. Fora de escopo

- Enforcement real de limite de reservas (apenas exibição).
- Tela de upgrade/downgrade entre Avulso e Profissional.
- Pro-rata ao trocar de plano.

## Pergunta aberta

Qual limite de reservas/mês usar no **Avulso**? Sugestão: **30**. Confirme ou indique outro número.
