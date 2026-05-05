# Próxima fase — Notificações push do navegador

Hoje os alertas de SLA estourado só aparecem com a aba `/alerts` aberta (toast Sonner). Vamos disparar notificação nativa do navegador na transição para `overdue`, funcionando com a aba em background.

## O que muda

### 1. Botão "Ativar avisos" em `/alerts`
- Mostra estado atual: `default` → botão "Ativar avisos do navegador"; `granted` → badge "Avisos ativos"; `denied` → aviso curto pedindo para reativar nas configurações do navegador.
- Clique chama `Notification.requestPermission()` e atualiza estado local.

### 2. Disparo no hook `useLeadAlerts`
- Onde já existe a lógica de toast na transição `ok|warning → overdue`, adicionar `new Notification(...)` quando `Notification.permission === "granted"` e o lead **não** estiver em snooze.
- `tag: "lead-overdue-<id>"` para evitar duplicatas.
- `onclick`: foca a aba e navega para `/leads/{id}`.

## Arquivos afetados
- `src/lib/useLeadAlerts.ts` — disparar `new Notification` ao lado do `toast.warning`.
- `src/routes/alerts.tsx` — botão/estado de permissão no header.
- `src/lib/i18n.tsx` — `alertsEnableNotifications`, `alertsNotificationsActive`, `alertsNotificationsBlocked`.

## Fora desta fase
- Push real com app fechado (precisa Service Worker + Web Push).
- Som customizado.
- Painel de SLA analytics e config de janelas por estágio (próximas).