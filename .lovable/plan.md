## Objetivo

Criar uma página `/licenca` onde o usuário (logado, dono de uma empresa) digita um código. Ao inserir `BOSCO1`, a empresa ganha acesso total ao app por **12 meses**. O código é de **uso único** — depois de resgatado uma vez, ninguém mais consegue ativar.

## Banco de dados (migração)

Criar tabela `public.license_codes` para gerenciar códigos de licença reutilizáveis no futuro:

```
license_codes
- id uuid pk
- code text unique not null            (ex.: 'BOSCO1', case-insensitive)
- plan_code text not null              (qual plano libera — usaremos 'premium' ou o melhor existente)
- duration_days int not null           (365 para BOSCO1)
- max_uses int not null default 1
- uses_count int not null default 0
- is_active bool not null default true
- redeemed_by_tenant_id uuid           (preenchido ao resgatar — auditoria)
- redeemed_by_user_id uuid
- redeemed_at timestamptz
- created_at / updated_at
```

Grants para `authenticated` (SELECT para checar validade) e `service_role` (escrita via serverFn admin). RLS habilitada com policy de SELECT apenas em códigos ativos.

Seed: inserir `BOSCO1` com `duration_days = 365`, `max_uses = 1`, `plan_code = 'premium'` (ou o code do plano de maior nível existente — vou conferir `plans` na hora e usar o equivalente "acesso total").

## Server function

`src/lib/license.functions.ts` — `redeemLicenseCode({ code })`:

1. `requireSupabaseAuth` — pega `userId`.
2. Resolve tenant ativo do usuário (`resolveUserTenantId`).
3. Verifica que o usuário é `owner` do tenant (senão, erro).
4. Carrega `license_codes` por `lower(code)`; valida `is_active`, `uses_count < max_uses`.
5. Em transação (via `supabaseAdmin`):
   - Incrementa `uses_count`, grava `redeemed_by_tenant_id/user_id/at`. Se atingiu `max_uses`, marca `is_active = false`.
   - Faz upsert em `subscriptions` para o tenant: `plan_id` do plano `premium`, `status = 'active'`, `current_period_start = now()`, `current_period_end = now() + 365 days`, `trial_end = null`, `grace_until = null`.
6. Retorna `{ ok: true, expires_at }`.

Tratamento de erros amigável: "Código inválido", "Código já utilizado", "Apenas o dono da empresa pode ativar".

## Rota / UI

`src/routes/licenca.tsx` — dentro de `AuthGate` + `AppShell`:

- Card centralizado com título "Ativar licença".
- Input para o código + botão "Ativar".
- Validação Zod (1–32 chars, alfanumérico).
- Ao sucesso: toast "Licença ativada até dd/mm/aaaa", `reload()` do `TenantProvider`, invalida `billing-overview`, redireciona para `/dashboard`.
- Mostra também o status atual da assinatura (se já houver acesso ativo via licença, exibe "Licença ativa até X").

Link discreto no menu lateral (`AppShell`) e na página `/billing` ("Tenho um código de licença → /licenca").

## Arquivos a criar/editar

- `supabase/migrations/<timestamp>_license_codes.sql` — tabela, grants, RLS, seed `BOSCO1`.
- `src/lib/license.functions.ts` — serverFn `redeemLicenseCode`.
- `src/routes/licenca.tsx` — UI da página.
- `src/components/AppShell.tsx` — adicionar item de menu "Licença".
- `src/routes/billing.tsx` — link "Tenho um código de licença".

Sem mudanças em `BillingAccessGate` — ele já libera quando `subscriptions.status = 'active'` e `current_period_end` no futuro.
