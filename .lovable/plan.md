# Implementar Fases 4–7 do roadmap de Alertas/SLA

Como a Fase 3 (Painel de SLA) já está pronta, este plano cobre as **4 fases restantes** do roadmap, na ordem original. Cada fase é independente e pode ser revertida sem afetar as anteriores.

---

## Fase 4 — Configuração de SLA por estágio (admin)

Hoje os limites de SLA estão fixos em `src/lib/leadSla.ts` (`LEAD_SLA_DAYS`). A Fase 4 move isso para o banco e adiciona uma tela admin.

**Migração**
- Nova tabela `sla_settings`:
  - `id uuid pk`, `stage lead_status not null unique`, `warning_hours int not null`, `overdue_hours int not null`, `updated_at timestamptz default now()`, `updated_by uuid`.
  - RLS: `select` autenticado; `insert/update/delete` apenas `is_admin`.
  - Seed com os valores atuais de `LEAD_SLA_DAYS` (convertidos para horas).

**Código**
- `src/lib/leadSla.ts`: adicionar `loadSlaSettings()` + `computeLeadSla(lead, settings?)`. Quando `settings` não vier, faz fallback para os valores atuais (mantém retrocompatibilidade).
- `src/hooks/useSlaSettings.ts` (novo): carrega `sla_settings` uma vez por sessão (cache em memória) e expõe `{ settings, isLoading }`.
- `src/routes/alerts.tsx` e `src/routes/alerts.sla.tsx`: usar `useSlaSettings()` e passar para `computeLeadSla`.
- `src/routes/settings.sla.tsx` (nova rota, admin-only): tabela com uma linha por estágio, dois inputs numéricos (warning/overdue em horas), botão **Salvar**, botão **Restaurar padrão**.
- `src/components/AppShell.tsx`: link "SLA" dentro do menu Configurações (visível só para admin).
- `src/lib/i18n.tsx`: ~10 chaves novas (`slaSettingsTitle`, `slaStage`, `slaWarningHours`, `slaOverdueHours`, `slaSettingsSaved`, `slaRestoreDefaults`, etc.) nos 3 idiomas.

---

## Fase 5 — Templates de mensagem editáveis pelo usuário

**Migração**
- Adicionar coluna `message_templates jsonb not null default '{}'::jsonb` em `profiles`.
  - Estrutura: `{ whatsapp: string, email_subject: string, email_body: string }`. Campos vazios usam o default atual.

**Código**
- `src/lib/messageTemplates.ts` (novo):
  - `DEFAULT_TEMPLATES` (pt/en/es) extraídos do que `alerts.tsx` já gera hoje.
  - `renderTemplate(text, vars)` substitui `{nome}`, `{primeiro_nome}`, `{destino}`, `{vendedor}`, `{empresa}`.
  - Hook `useUserTemplates()` carrega `profiles.message_templates` uma vez por sessão.
- `src/routes/settings.templates.tsx` (nova rota): 3 textareas (WhatsApp / assunto e-mail / corpo e-mail), painel lateral listando variáveis disponíveis, **preview ao vivo** com lead de exemplo, botão **Restaurar padrão** por campo, botão **Salvar**.
- `src/routes/alerts.tsx` e `src/routes/leads.$leadId.tsx`: `buildWhatsappLink` / `buildMailtoLink` aceitam `templates` opcional + dados do lead e renderizam variáveis.
- `src/components/AppShell.tsx`: link "Mensagens" em Configurações.
- `src/lib/i18n.tsx`: ~20 chaves (título, subtítulo, labels, variáveis, preview, salvar, restaurar) nos 3 idiomas.

**Fora de escopo:** múltiplos templates por canal, templates compartilhados entre vendedores.

---

## Fase 6 — Push real (notificações com a aba fechada)

A Fase 2 já cobre notificações com a aba aberta. A Fase 6 adiciona Web Push real via Service Worker.

**Migração**
- Tabela `push_subscriptions`: `id`, `user_id uuid not null`, `endpoint text unique`, `p256dh text`, `auth text`, `user_agent text`, `created_at`, `last_used_at`.
  - RLS: usuário gerencia as próprias; admin lê todas.

**Código**
- `public/sw.js` (novo): Service Worker mínimo com handler `push` que mostra notificação e `notificationclick` que abre `/alerts` ou o lead específico.
- `src/lib/pushSubscription.ts` (novo): registra SW, pede permissão, faz `subscribe()` no `PushManager` e salva no banco. Handle de unsubscribe.
- `src/routes/alerts.tsx`: o botão "Ativar avisos" agora também registra push (além das notificações nativas já implementadas na Fase 2).
- **Edge function** `supabase/functions/check-sla-alerts/index.ts` (nova, cron a cada 5min):
  - Lê leads com status `novo`/`em_contato` cujo SLA virou `overdue` desde a última execução.
  - Aplica snoozes ativos (`lead_alert_snoozes`).
  - Envia Web Push para `push_subscriptions` do `assigned_to` usando `web-push` (chaves VAPID).
- Secrets necessários: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (vou pedir ao usuário via `add_secret`).
- Configurar cron via `pg_cron` ou agendador externo apontando para `/api/public/cron/check-sla` (rota pública com verificação de secret).

**Nota:** Implementar com fallback gracioso — se push não estiver disponível (Safari iOS antigo, permissão negada), continua usando as notificações em-tab da Fase 2.

---

## Fase 7 — Escalonamento e acompanhamento de gestor

**Migração**
- Tabela `sla_escalations`: `id`, `lead_id uuid not null`, `escalated_at timestamptz default now()`, `escalated_to uuid` (gestor), `reason text` (`overdue_24h`, `overdue_48h`, `manual`), `resolved_at timestamptz`, `resolved_by uuid`, `resolution text` (`reassigned`, `contacted`, `dismissed`).
  - RLS: admin total; vendedor lê próprios leads.
- Coluna `manager_id uuid` em `profiles` (gestor direto de cada vendedor).

**Código**
- Edge function da Fase 6 ganha um segundo passo: leads `overdue` há > 24h sem interação criam um registro em `sla_escalations` (idempotente por dia) e disparam e-mail via Resend/Lovable Cloud para o `manager_id` do `assigned_to`.
- `src/routes/alerts.sla.tsx`: nova seção "Escalonamentos abertos" com tabela (lead, vendedor, motivo, há quanto tempo) e ações **Reatribuir** (abre modal com lista de vendedores) e **Resolver** (marca `resolved_at`).
- `src/routes/leads.$leadId.tsx`: badge "Escalonado" quando há escalation aberta.
- `src/routes/settings.team.tsx` (ou aba existente): admin define `manager_id` por vendedor.
- Edge function `supabase/functions/send-escalation-email/index.ts`: usa Resend (ou Lovable AI mailer) para enviar resumo diário ao gestor.
- `src/lib/i18n.tsx`: ~15 chaves para escalonamento.

**Secret necessário:** `RESEND_API_KEY` (se ainda não configurado — vou checar antes de pedir).

---

## Resumo de arquivos

**Novos**
- `src/routes/settings.sla.tsx`, `src/routes/settings.templates.tsx`
- `src/lib/messageTemplates.ts`, `src/hooks/useSlaSettings.ts`, `src/lib/pushSubscription.ts`
- `public/sw.js`
- `supabase/functions/check-sla-alerts/index.ts`, `supabase/functions/send-escalation-email/index.ts`

**Editados**
- `src/lib/leadSla.ts`, `src/lib/i18n.tsx`
- `src/routes/alerts.tsx`, `src/routes/alerts.sla.tsx`, `src/routes/leads.$leadId.tsx`
- `src/components/AppShell.tsx`

**Migrações**
- `sla_settings` (+ seed)
- `profiles.message_templates`
- `push_subscriptions`
- `sla_escalations` + `profiles.manager_id`

---

## Ordem de execução sugerida

1. **Fase 4** primeiro (rápida, baixo risco, desbloqueia ajuste fino dos limites).
2. **Fase 5** (independente, valor imediato para vendedores).
3. **Fase 6** (mais complexa, exige VAPID keys — vou pedir antes de começar).
4. **Fase 7** (depende da Fase 6 estar funcionando).

Posso entregar tudo num único ciclo, ou parar após cada fase para você validar antes da próxima. Me diga a preferência.
