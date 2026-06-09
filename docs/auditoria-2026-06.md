# Auditoria Sênior — BSS Tour System (CRM)

**Data:** 2026-06-09  
**Escopo:** Engenharia de Dados, Segurança, Backend, Integrações, Frontend, O&M  
**Modo:** Read-only — nenhuma alteração de código ou schema foi feita nesta etapa.  
**Stack:** TanStack Start v1 (React 19, Vite 7) + Lovable Cloud (Supabase) + Cloudflare Workers.

---

## 0. Sumário Executivo

O sistema está **funcional e operando**, com fundamentos corretos: RLS habilitado em 100% das tabelas `public`, multi-tenant implementado, sistema de permissões granular (módulo + campo + override por usuário), 3 cron jobs ativos, OAuth Google próprio, WhatsApp Meta com tokens criptografados, push (VAPID), assistant IA.

**Volumetria atual (1 tenant, 8 membros, 5 perfis ativos):**

| Entidade | Linhas |
|---|---:|
| `suppliers` | 638 |
| `customers` | 233 |
| `emails` | 1 016 |
| `email_threads` | 382 |
| `leads` | 9 |
| `bookings` | 4 |
| `quotes` | 10 |
| `tasks` | 18 |
| `user_gmail_tokens` | **0** ⚠️ |
| `cron.job` | 3 (ativos) |

**Saúde geral:** 🟡 **Amarelo** — sem incidentes críticos, mas com 40 achados de segurança/qualidade do linter, integração Gmail sem tokens vivos, observabilidade fraca, dois temas (auditoria, runbooks) inexistentes.

**Top 5 prioridades imediatas (Onda 1):**
1. 🔴 Corrigir `search_path` mutável em funções `SECURITY DEFINER` (privilege escalation potencial).
2. 🔴 Revogar `EXECUTE` público em funções `SECURITY DEFINER` (anon executando funções privilegiadas).
3. 🟠 Ativar fluxo "Conectar Gmail" para usuários — sem `user_gmail_tokens`, 100% do polling Gmail falha silenciosamente.
4. 🟠 Confirmar refresh token logic em `gmail-auth.server.ts` (tokens expiram em 1 h).
5. 🟠 Criar runbooks mínimos (OAuth expirado, webhook falhou, tenant LGPD).

---

## 1. Engenharia de Dados

### 1.1 Modelo (70 tabelas em `public`)
- ✅ **Multi-tenant coerente.** 55/70 tabelas têm `tenant_id`. As 15 sem `tenant_id` são intencionalmente globais: `tenants`, `super_admins`, `user_roles`, `profiles`, `plans`, `plan_addons`, `plan_one_time`, `subscription_addons`, `permission_modules`, `role_module_permissions`, `role_field_permissions`, `ref_cities`, `ref_service_categories`, `ref_services`, `user_audit_log`. **OK.**
- ✅ **RLS habilitado em 100%** das tabelas `public` (query confirmou zero tabelas sem RLS).
- 🟡 **`emails` × `user_gmail_tokens`:** 1 016 emails espelhados, mas **zero tokens vivos**. Indica que houve seed/import histórico mas nenhum usuário concluiu o OAuth atual — incremental sync e envio estão quebrados na prática.
- 🟡 **`activity_log` (80 linhas)** — ainda baixo, mas sem política de retenção definida. Sugerir TTL de 180 dias com job de purge.
- 🟢 Triggers de geração de código (`set_lead_code`, `set_customer_code`, `set_supplier_code`) e `auto_link_email_by_thread` parecem corretos e `SECURITY DEFINER` com `search_path` setado.

### 1.2 Índices & performance
- Tabelas maiores hoje (`suppliers` 638, `emails` 1 016) ainda cabem em scan sequencial, mas **`emails` deve ganhar índices** quando crescer:
  - `(tenant_id, lead_id)`, `(tenant_id, customer_id)`, `(tenant_id, supplier_id)`, `(thread_id)`, `(owner_email, received_at DESC)`.
- `email_threads(thread_id)` e `email_message_links(gmail_message_id, gmail_thread_id)` — verificar índices únicos.
- `activity_log(entity_type, entity_id, created_at DESC)` — futuro hot path para timelines.
- Frontend (`leads.tsx`, `dashboard.tsx`, `bookings.tsx`) faz múltiplos `select` sequenciais por linha em alguns lugares — risco de N+1 a partir de ~100 leads.

### 1.3 Storage (9 buckets, todos privados)
- ✅ Função `storage_path_allowed_for_user` aplica isolamento por tenant via primeiro segmento do path.
- 🟡 Nenhum job de limpeza para anexos órfãos (`email-attachments`, `proposal-docs`, `voucher`, `invoice-docs`). Crescimento sem controle.

---

## 2. Segurança

Linter retornou **33 issues**, scan de segurança **40 findings**.

### 2.1 Críticos / Altos (corrigir Onda 1)
- 🔴 **Function Search Path Mutable** (várias funções `vector_*`, `halfvec_*`, `sparsevec_*` da extensão `pgvector` em `public`). Extensões `pgvector` e `unaccent` estão em `public`. Risco: ataque de hijack via `search_path` em chamadas `SECURITY DEFINER`. Mitigação: mover extensões para `extensions` schema (migração maior) ou garantir que toda função `SECURITY DEFINER` própria já tenha `SET search_path` (já está — ver `has_role`, `is_admin`, etc.).
- 🔴 **Public Can Execute SECURITY DEFINER Function** (~25 ocorrências). Funções como `has_role`, `is_admin`, `has_module_permission`, `current_tenant_id`, `generate_entity_code`, `link_email_thread`, `_notify_apikey` estão executáveis por `anon`. `_notify_apikey()` em particular **retorna o anon key em texto puro** — não é um secret, mas expor por função pública é desnecessário. Mitigação:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.<fn>(...) FROM anon, public;
  GRANT EXECUTE ON FUNCTION public.<fn>(...) TO authenticated, service_role;
  ```

### 2.2 Médios
- 🟡 **Extension in Public** — `pgvector`, `unaccent`. Aceitável em projeto pequeno, mas mover para schema `extensions` é o padrão Supabase.
- 🟡 **Rotas `/api/public/*` sem rate-limit.** Endpoints Gmail add-on (`/api/public/gmail/lookup`, `/lead`, `/deal`, `/contact`, `/activity`) usam `CRM_GMAIL_ADDON_TOKEN` como bearer — bom, mas sem throttling. Idem WhatsApp webhook e `billing.webhook`.
- 🟡 **Validação Zod inconsistente** em alguns `/api/public/hooks/*` — confirmar.
- 🟡 **`_notify_apikey()` retorna anon key hard-coded.** Funcional mas inelegante; deve vir de `current_setting` ou variável.

### 2.3 Sistema de permissões (próprio)
- ✅ Modelo de 3 camadas (role → module → field) com overrides por usuário é robusto.
- ✅ Funções `has_module_permission` e `has_field_permission` corretas, com `SECURITY DEFINER` e `search_path`.
- ✅ Edit-gating implementado no frontend em `/settings/permissions` ("não pode conceder o que não possui").
- 🟡 Falta UI de auditoria das permissões efetivas por usuário (já existe `/permissions-audit` — confirmar cobertura).

---

## 3. Backend / Server Functions

### 3.1 Inventário `src/server/*` (17 arquivos)
| Arquivo | Status |
|---|---|
| `assistant.functions.ts` + `.prompt.ts` + `.tools.ts` | ✅ ativo (Lovable AI) |
| `gmail.functions.ts` + `gmail-mirror.functions.ts` + `.server.ts` | ✅ ativo, mas inerte sem tokens |
| `gmail-auth.server.ts` + `gmail-auth-middleware.ts` | ✅ refresh token (a confirmar funcionamento) |
| `whatsapp.functions.ts` + `whatsapp-crypto.server.ts` + `whatsapp-meta.server.ts` | ✅ ativo |
| `push.functions.ts` + `push.server.ts` | ✅ ativo |
| `sla.functions.ts` | ✅ ativo (cron a cada 30min) |
| `tenant.server.ts` | ✅ |
| `security-audit.functions.ts` | ✅ |
| `debug-notifications.functions.ts` | 🟡 ferramenta de dev em produção — revisar gate admin |

### 3.2 Server routes públicas (`src/routes/api/public/*`)
| Rota | Auth | Status |
|---|---|---|
| `/billing.webhook` | assinatura Stripe? | revisar |
| `/gmail-poll` | apikey | ✅ ativo (cron a cada 1min) |
| `/gmail/{lookup,lead,deal,contact,activity}` | `CRM_GMAIL_ADDON_TOKEN` | ✅ |
| `/google/oauth/{start,callback}` | bearer Supabase / HMAC state | ✅ |
| `/hooks/{lead-events,sla-escalations,task-due}` | apikey | ✅ (chamados por `pg_cron` + triggers) |
| `/whatsapp/webhook` | assinatura Meta | revisar |

### 3.3 Convenções
- ✅ `attachSupabaseAuth` registrado (assumido — confirmar em `src/start.ts`).
- 🟡 **Logging não-estruturado.** `console.log/error` sem correlação. Adicionar `requestId` e padronizar payload.
- 🟡 **Sem idempotência explícita** em webhooks billing/WhatsApp/Gmail-poll (chave única por `event_id`).

### 3.4 Edge Functions legadas (`supabase/functions/*`, 8 funções)
`admin-users`, `extract-supplier-contacts`, `extract-supplier-rates`, `generate-invoice-doc`, `generate-proposal-doc`, `itinerary-search`, `process-itinerary`, `propose-tour-program`, `transcribe-proposal-items`.
- 🟡 Coexistência Edge + serverFn aumenta superfície. Avaliar migrar para serverFn (CPU-bound: manter Edge; rápido/leve: serverFn).

---

## 4. Integrações

### 4.1 Gmail (OAuth próprio)
- ✅ Fluxo completo: `/start` → consent → `/callback` → upsert tokens + sync state.
- ✅ Scopes corretos (readonly + modify + send).
- ✅ `pg_cron` `gmail-incremental-poll` rodando **a cada minuto**.
- 🔴 **Zero tokens em `user_gmail_tokens`.** Polling roda mas processa 0 contas. Causa provável: ninguém clicou em "Conectar Gmail" — talvez o botão nem esteja visível na UI de Settings/Users. **Ação:** adicionar botão claro em `/settings` ou `/users/$id` e instrumentar telemetria de conexão.
- 🟡 Confirmar que `gmail-auth.server.ts` faz refresh quando `expires_at < now()`.

### 4.2 WhatsApp Meta
- ✅ Tokens criptografados (`whatsapp-crypto.server.ts` + `WHATSAPP_TOKEN_ENCRYPTION_KEY`).
- 🟡 Webhook precisa verificar assinatura `x-hub-signature-256`.

### 4.3 Lovable AI
- ✅ Usado em assistant, triagem, geração de imagens, propostas, itinerários.
- 🟡 Sem cap de tokens por tenant — risco de custo descontrolado em multi-tenant futuro.

### 4.4 Billing
- 🟡 Tabelas `plans`, `plan_addons`, `subscriptions`, `billing_invoices` existem mas sem Stripe/Paddle ativo (perguntado antes — aguarda decisão).

---

## 5. Frontend / UX

- ✅ 60+ rotas TanStack file-based, layout via `__root.tsx` + `_authenticated` (assumido).
- 🟡 **Verificar `errorComponent`/`notFoundComponent`** em rotas com loader. Convenção do template exige.
- 🟡 **Padrão de fetch misto:** algumas páginas usam `useQuery`, outras `useEffect+supabase.from`. Recomendado: padronizar em `ensureQueryData` no loader + `useSuspenseQuery` no componente para rotas pesadas.
- 🟡 Bundle size: 60+ rotas + framer-motion + shadcn full — provavelmente >500 KB. Lazy-load rotas raras (`marketing`, `biblia`, `permissions-audit`).
- 🟡 **i18n** (`src/lib/i18n.tsx`) — cobertura PT/EN parcial. Auditar chaves órfãs.
- 🟡 Erro runtime atual no preview: `Failed to fetch dynamically imported module … virtual:tanstack-start-client-entry` + 500 em `AssistantFab.tsx`. Provavelmente recompilação parcial — não bloqueante mas indica fragilidade do HMR com o fab globalmente montado.

---

## 6. O&M (Operação & Manutenção)

### 6.1 Cron / Jobs (✅ melhor do que eu pensava)
| jobid | nome | schedule | função |
|---|---|---|---|
| 1 | notify-task-due | `*/5 * * * *` | chama `/api/public/hooks/task-due` |
| 2 | sla-escalation-check | `*/30 * * * *` | chama `/api/public/hooks/sla-escalations` |
| 3 | gmail-incremental-poll | `* * * * *` | chama `/api/public/gmail-poll` |

🟡 **Falta:** purge de `activity_log`, purge de `notification_logs`, purge de anexos órfãos, refresh proativo de tokens Gmail próximos do vencimento, snapshot de métricas para dashboard.

### 6.2 Observabilidade
- 🔴 **Sem dashboard de saúde.** Não há painel mostrando: webhooks últimas 24h (sucesso/erro), latência de cron, tokens vivos, fila de emails, jobs em retry.
- 🟡 Logs dispersos: worker (TanStack), edge (Supabase), postgres. Sem agregador.
- 🟡 Sem alerta proativo (Slack/email) para erros 5xx nos webhooks.

### 6.3 Backup & DR
- ✅ Supabase faz backup diário (gerido pela plataforma).
- 🟡 RPO/RTO **não declarados** — definir e documentar.
- 🟡 Nenhum teste de restore documentado.

### 6.4 LGPD / Privacidade
- 🟡 Sem fluxo formal de **exportação** ou **exclusão** de dados por solicitação do titular.
- 🟡 Tabela `user_audit_log` existe mas cobertura precisa ser validada.
- 🟡 Retenção de logs e emails não declarada (`emails`, `whatsapp_messages`).

### 6.5 Custos
- 🟡 Sem rateio por tenant para: storage, AI tokens, edge invocations.

### 6.6 SLOs sugeridos
| Métrica | Alvo |
|---|---|
| Uptime app | 99,5% mensal |
| Latência p95 página principal | < 2 s |
| Latência p95 server function | < 800 ms |
| Sucesso webhook billing/whatsapp | > 99% em 24 h |
| Refresh token Gmail | < 1% falha por dia |

---

## 7. Apêndice — Comandos usados (read-only)

- `supabase--linter` → 33 issues
- `security--run_security_scan` → 40 findings
- `supabase--read_query` (contagens, RLS, cron, multi-tenant) → ver Sumário
- `supabase--db_health` → falhou (`metrics payload exceeded size cap`) — re-tentar quando sandbox liberar
- Leitura de `src/server/*` e `src/routes/api/public/*` para inventário

Backlog priorizado: ver `docs/auditoria-backlog.md`.
