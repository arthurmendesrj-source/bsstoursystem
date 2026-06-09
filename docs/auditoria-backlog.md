# Backlog Priorizado — Auditoria 2026-06

Legenda: **I** = Impacto (1-5), **E** = Esforço (1-5), **P** = I − E (maior = mais prioritário).

---

## 🔴 Onda 1 — 1 a 2 semanas (correções críticas)

| # | Item | I | E | P | Área |
|---|---|---:|---:|---:|---|
| 1 | Revogar `EXECUTE` em funções `SECURITY DEFINER` para `anon`/`public` | 5 | 1 | 4 | Segurança |
| 2 | Setar `SET search_path = public` em qualquer função `SECURITY DEFINER` que ainda não tenha | 5 | 1 | 4 | Segurança |
| 3 | Botão "Conectar Gmail" visível em `/settings` + telemetria; documentar passo-a-passo | 5 | 2 | 3 | Integrações |
| 4 | Confirmar/instrumentar refresh de `access_token` em `gmail-auth.server.ts` | 5 | 2 | 3 | Integrações |
| 5 | Adicionar verificação de assinatura nos webhooks `billing` e `whatsapp` (se ausente) | 5 | 2 | 3 | Segurança |
| 6 | Validação Zod em todas as rotas `/api/public/*` (entrada) | 4 | 2 | 2 | Segurança |
| 7 | Runbooks mínimos: OAuth expirado, webhook falhou, exportação/exclusão LGPD | 4 | 2 | 2 | O&M |
| 8 | Remover/gatear `debug-notifications.functions.ts` em produção | 3 | 1 | 2 | Backend |

---

## 🟠 Onda 2 — 3 a 6 semanas (qualidade & observabilidade)

| # | Item | I | E | P | Área |
|---|---|---:|---:|---:|---|
| 9 | Dashboard interno `/admin/health`: cron last-run, webhooks 24h, tokens vivos, fila | 5 | 3 | 2 | O&M |
| 10 | Índices em `emails`, `email_threads`, `activity_log`, `notification_logs` | 4 | 2 | 2 | Dados |
| 11 | Idempotência em webhooks (tabela `webhook_events(event_id PK, processed_at)`) | 4 | 2 | 2 | Backend |
| 12 | Logs estruturados (`requestId`, `tenantId`, `userId`) + sink central | 4 | 3 | 1 | O&M |
| 13 | Purge cron: `activity_log` >180d, `notification_logs` >90d, anexos órfãos | 3 | 2 | 1 | Dados |
| 14 | Mover extensões `pgvector`/`unaccent` para schema `extensions` | 3 | 3 | 0 | Segurança |
| 15 | Padronizar fetch frontend para `ensureQueryData` + `useSuspenseQuery` nas rotas hot | 4 | 3 | 1 | Frontend |
| 16 | Lazy-load rotas raras (`marketing`, `biblia`, `permissions-audit`) | 3 | 2 | 1 | Frontend |
| 17 | Cobertura `errorComponent`/`notFoundComponent` em todas as rotas com loader | 3 | 2 | 1 | Frontend |
| 18 | Telemetria de uso por tenant (AI tokens, storage, edge invocations) | 4 | 3 | 1 | O&M |
| 19 | Substituir `_notify_apikey()` hard-coded por leitura via setting | 2 | 1 | 1 | Segurança |

---

## 🟢 Onda 3 — >6 semanas (evolução de produto)

| # | Item | I | E | P | Área |
|---|---|---:|---:|---:|---|
| 20 | Stripe/Paddle ativo com webhook idempotente, página `/billing` completa | 5 | 4 | 1 | Billing |
| 21 | Multi-tenant maduro: switcher polido, isolamento de storage por path-prefix verificado | 4 | 3 | 1 | Plataforma |
| 22 | Fluxo LGPD completo: exportação JSON + exclusão "hard" com tombstone | 4 | 4 | 0 | Compliance |
| 23 | Migração seletiva de Edge Functions para serverFn (lightweight ones) | 3 | 4 | -1 | Backend |
| 24 | Alertas Slack/email para erros 5xx e jobs cron falhos | 4 | 3 | 1 | O&M |
| 25 | Plano de DR documentado (RPO 24h / RTO 4h) + teste de restore semestral | 4 | 3 | 1 | O&M |
| 26 | Cap de AI tokens por tenant + soft-throttle | 3 | 3 | 0 | Plataforma |
| 27 | i18n: auditoria de chaves órfãs + cobertura 100% PT/EN | 3 | 3 | 0 | Frontend |

---

## SLOs sugeridos (acompanhar no dashboard da Onda 2)

| Métrica | Alvo |
|---|---|
| Uptime app | 99,5% / mês |
| Latência p95 navegação | < 2 s |
| Latência p95 serverFn | < 800 ms |
| Sucesso webhooks (billing / whatsapp / hooks) | > 99% em 24 h |
| Falha refresh Gmail | < 1% / dia |
| Cron jobs com `last_run` < 2× schedule | 100% |
