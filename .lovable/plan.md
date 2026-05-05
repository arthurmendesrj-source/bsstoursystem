# Roadmap de 7 fases — evolução do módulo de Alertas/SLA

Plano consolidado para tirar o módulo de "feed reativo" e transformar em um sistema completo de gestão de SLA. As fases 1–2 já foram entregues; as próximas estão em ordem de impacto/dependência.

---

## ✅ Fase 1 — Snooze + meta diária no banco *(feito)*
- Tabela `lead_alert_snoozes` com RLS, sincroniza entre dispositivos.
- Migração automática do `localStorage` antigo.
- `daily_followup_goal` em `profiles` + mini-histórico de 7 dias no card de meta.

## ✅ Fase 2 — Notificações nativas do navegador *(feito)*
- Botão "Ativar avisos" no header de `/alerts`.
- `new Notification(...)` na transição `ok|warning → overdue`, com clique navegando para o lead.
- Respeita snooze.

---

## Fase 3 — Painel de SLA (analytics)
Nova rota `/alerts/sla` (admin/gestor) com:
- Filtro de período (7/30/90 dias).
- Cards: leads no período, % com SLA estourado, tempo médio até 1º contato, total de interações.
- Tabela "tempo até 1º contato por vendedor" (média + mediana).
- Barras "% SLA estourado por estágio".
- Ranking de cumprimento de meta (últimos 7 dias).

**Arquivos**: novo `src/routes/alerts.sla.tsx`, link admin no `alerts.tsx`, chaves i18n.

## Fase 4 — Configuração de SLA por estágio
Hoje as janelas de warning/overdue são fixas no código.
- Tabela `sla_settings` (`stage`, `warning_hours`, `overdue_hours`).
- Tela `/settings/sla` (admin) com inputs por estágio.
- `computeLeadSla` lê do banco com fallback para defaults.

## Fase 5 — Templates de mensagem editáveis
WhatsApp/e-mail/ligação hoje têm texto fixo em PT.
- `message_templates jsonb` em `profiles`.
- Tela `/settings/templates` com 3 textareas + variáveis (`{nome}`, `{destino}`, `{vendedor}`) + preview ao vivo.
- `alerts.tsx` e `leads.$leadId.tsx` usam o template do usuário ao montar links.

## Fase 6 — Push real (app fechado)
Hoje a notificação só dispara com a aba aberta.
- Service Worker + Web Push API (VAPID).
- Tabela `push_subscriptions` por usuário/dispositivo.
- Edge function que escuta transição para overdue (cron a cada 5 min) e envia push.
- Permite alertar mesmo sem a aba aberta.

## Fase 7 — Escalonamento e acompanhamento de gestor
Quando um lead fica overdue por X horas sem ação:
- Tabela `sla_escalations` registra o evento.
- Notifica o gestor (admin) por push + e-mail (Resend/Lovable Cloud) com botão "reatribuir".
- Card no painel de SLA mostra leads escalados e tempo médio de resolução.
- Reatribuição rápida para outro vendedor a partir do alerta.

---

## Como vamos tocar
Cada fase é uma entrega independente — depois de aprovar este roadmap, te apresento o plano detalhado da Fase 3 e seguimos uma a uma. Você pode pular fases ou trocar a ordem se quiser priorizar (ex.: Fase 5 antes da 4, ou pular Fase 6 se push real não for crítico agora).