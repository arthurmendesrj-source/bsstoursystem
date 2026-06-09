
# Auditoria Sênior do App — Engenharia de Dados & O&M

Objetivo: produzir um diagnóstico independente do estado atual do CRM (BSS Tour System) e um plano de melhorias priorizado, sem alterar código nesta etapa. Entrega: um relatório em `/docs/auditoria-2026-06.md` + um backlog priorizado.

## Escopo da auditoria

### 1. Engenharia de Dados
- **Modelo de dados** — revisar as ~70 tabelas (`leads`, `customers`, `suppliers`, `bookings`, `quotes`, `emails`, `whatsapp_*`, `tasks`, `itineraries`, `permissions`, `tenants`, etc.): normalização, FKs faltantes, índices ausentes em colunas de filtro/junção, colunas órfãs, tipos inadequados.
- **Multi-tenant** — coerência de `tenant_id` em todas as tabelas, uso de `current_tenant_id()` nas policies, vazamentos potenciais entre tenants.
- **RLS & GRANTs** — rodar linter, conferir cada tabela `public.*`: RLS habilitado, policies coerentes, GRANTs corretos para `authenticated`/`anon`/`service_role`.
- **Funções e triggers** — auditar as funções `SECURITY DEFINER` (`has_role`, `has_module_permission`, `generate_entity_code`, `on_lead_event`, `link_email_thread`, etc.): `search_path`, riscos de privilege escalation, performance.
- **Integridade & qualidade** — registros órfãos, duplicatas (ex.: `emails` 1016 vs `user_gmail_tokens` 0), `email_sync_state` inconsistente, `activity_log` crescimento, dados de teste em produção.
- **Performance** — tabelas grandes sem índice, queries N+1 prováveis na UI (`leads.tsx`, `dashboard.tsx`), uso de `pg_stat_statements` se disponível, `db_health`.
- **Storage** — 9 buckets privados: política `storage_path_allowed_for_user`, tamanho, lixo (anexos órfãos).

### 2. Segurança
- Resultado do `security--run_security_scan` + `supabase--linter`.
- Secrets expostos vs server-only (`SUPABASE_SERVICE_ROLE_KEY`, `CRM_GMAIL_ADDON_TOKEN`, VAPID, WhatsApp encryption key).
- Rotas `/api/public/*`: verificação de assinatura, rate-limit, validação Zod.
- Sistema de permissões (`role_module_permissions`, `role_field_permissions`, overrides por usuário) — gaps de cobertura.
- Auditoria (`activity_log`, `user_audit_log`, `storage_access_log`, `voucher_send_log`) — cobertura e retenção.

### 3. Backend / Server Functions
- Mapeamento de todas as `*.functions.ts` e `routes/api/*`: quais estão vivas, quais são stubs (`gmail-poll`).
- Uso correto de `requireSupabaseAuth` + `attachSupabaseAuth` em `start.ts`.
- Tratamento de erros, logs estruturados, idempotência de webhooks (Stripe/Paddle, WhatsApp, Gmail add-on).
- Edge Functions legadas em `supabase/functions/*` (extract-supplier, generate-invoice/proposal-doc, transcribe, itinerary-search): manter em Edge ou migrar para serverFn.

### 4. Integrações
- **Gmail/Google OAuth** — fluxo, refresh token, ausência de cron de sync (já levantado).
- **WhatsApp Meta** — webhooks, criptografia de tokens, conversas/templates.
- **Lovable AI** — assistant, triagem de email, geração de imagem, propostas, itinerários.
- **Push (VAPID)** — assinaturas, logs de notificação, fallback.
- **Billing** — webhook, planos, addons, status de assinatura.

### 5. Frontend / UX
- Roteamento TanStack: 60+ rotas, possíveis duplicações, rotas sem `errorComponent`/`notFoundComponent`.
- Estados de loading/erro consistentes, uso de `useSuspenseQuery` vs `useEffect+fetch`.
- Performance percebida: bundles grandes, lazy-loading, imagens.
- Acessibilidade básica e responsividade.
- i18n (`i18n.tsx`) — cobertura PT/EN.

### 6. O&M (Operação & Manutenção)
- **Observabilidade** — logs (worker, edge, postgres), métricas, alertas; o que falta para ter um "painel verde/vermelho".
- **Cron / Jobs** — `pg_cron` está vazio; mapear jobs necessários (sync Gmail, SLA, cobrança, limpeza de logs, reprocessamento).
- **Backups & DR** — política de backup Supabase, RPO/RTO declarados.
- **Deploy & ambientes** — preview vs produção, secrets por ambiente, processo de release.
- **Runbooks** — o que fazer quando: webhook falha, OAuth expira, fila trava, tenant solicita exportação/exclusão LGPD.
- **Custos** — estimativa por tenant (DB, storage, AI tokens, edge invocations).
- **SLA interno** — definir SLOs (uptime, latência p95, erro de webhook).

## Entregáveis

1. `docs/auditoria-2026-06.md` — relatório consolidado com achados por área, severidade (Crítico/Alto/Médio/Baixo) e referência ao arquivo/tabela.
2. `docs/auditoria-backlog.md` — backlog priorizado (Impacto × Esforço) com 3 ondas:
   - **Onda 1 (1–2 semanas):** correções críticas de segurança/dados, ativar Gmail polling, corrigir RLS/GRANTs faltantes.
   - **Onda 2 (3–6 semanas):** observabilidade, runbooks, índices/performance, consolidar serverFn.
   - **Onda 3 (>6 semanas):** evoluções de produto (planos, billing, AI, multi-tenant maduro).
3. Atualização do `mem://index.md` com regras descobertas (ex.: padrões de RLS, padrão de logs).

## Método

- **Read-only.** Nenhuma migração, nenhum código alterado nesta fase.
- Ferramentas: `supabase--linter`, `security--run_security_scan`, `supabase--read_query`, `supabase--db_health`, `rg` no código, leitura de rotas/serverFn críticos.
- Uso de subagents em paralelo para áreas independentes (Dados, Segurança, Integrações, Frontend, O&M) e consolidação por mim.

## Perguntas antes de começar

1. **Profundidade**: auditoria executiva (~2 h de exploração, relatório de 6–10 páginas) ou aprofundada (varredura tabela-a-tabela e rota-a-rota, relatório de 20+ páginas)?
2. **Foco prioritário**: tudo com peso igual, ou priorizar uma área (ex.: segurança/LGPD, performance, integrações Gmail/WhatsApp, billing)?
3. **Formato do relatório**: markdown em `/docs` (versionado no repo) — ok, ou preferes PDF/Google Doc exportado?
4. **Backlog**: gerar como markdown, ou já criar issues/tasks dentro do próprio app (tabela `tasks`)?

Responda essas 4 (ou apenas "tudo padrão: aprofundada, foco igual, markdown, backlog markdown") e eu sigo para o modo de execução.
