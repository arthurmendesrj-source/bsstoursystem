# Próxima etapa — Snooze + meta diária no banco (multi-dispositivo)

Escolhi começar pela base que destrava as outras: tirar snooze e meta diária do `localStorage` e levar para o banco. Sem isso, push notifications e analytics de SLA ficam inconsistentes entre dispositivos.

## O que muda

### 1. Snooze persistente
- Nova tabela `lead_alert_snoozes` (`id`, `lead_id`, `user_id`, `snoozed_until`, `created_at`), única por (`lead_id`, `user_id`).
- RLS: usuário lê/escreve só os próprios; admin lê todos.
- `useLeadAlerts` carrega os snoozes do banco no mount + escuta realtime.
- Botão "Adiar" faz `upsert` no banco (não mais `localStorage`).
- Migração suave: na primeira execução, se houver `lead-alerts-snooze-v1` no `localStorage`, sobe pro banco e limpa a chave.

### 2. Meta diária no perfil
- Nova coluna `daily_followup_goal int default 10` em `profiles`.
- Card de meta lê/grava direto no perfil do usuário logado.
- Progresso continua sendo contado a partir das `interactions` criadas hoje pelo usuário (já funciona).

### 3. Mini-histórico de 7 dias
- Mesmo card mostra barrinhas dos últimos 7 dias (contagem de interações por dia × meta).
- Query agregada simples em `interactions` filtrando `created_by = auth.uid()` e `occurred_at >= now() - 7 days`.

## Arquivos afetados
- **Migração nova**: cria `lead_alert_snoozes` (com RLS) e adiciona `daily_followup_goal` em `profiles`.
- `src/lib/useLeadAlerts.ts` — snooze passa a vir do Supabase, com migração do localStorage.
- `src/routes/alerts.tsx` — card de meta lê do perfil + mini-gráfico de 7 dias; botão "Adiar" chama upsert.
- `src/lib/i18n.tsx` — chave nova para "últimos 7 dias" (PT/EN/ES).

## Fora desta etapa (próximas)
- Push notifications nativas do navegador.
- Painel de SLA (analytics para gestor).
- Configuração de janelas de SLA por estágio.