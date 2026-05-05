## Objetivo

Aprimorar o feed de alertas (`/alerts`) e o fluxo de SLA com 5 melhorias práticas que aumentam visibilidade, agilidade de ação e qualidade do follow-up.

## As 5 melhorias

### 1. Snooze (adiar alerta) por X horas
Botão "Adiar" em cada item do feed para ocultar temporariamente um lead (ex: 2h, 24h, até amanhã). Útil quando o vendedor já está tratando offline.
- Persistência local (localStorage) por `lead_id` + timestamp de expiração.
- Filtra alertas adiados em `useLeadAlerts` até expirar.

### 2. Filtros e busca rápida no feed
Barra superior com:
- Busca por nome do lead.
- Filtro por estágio (status do funil).
- Toggle "apenas meus leads" (atribuídos a mim) — útil para admins.

### 3. Ações rápidas multi-canal no item
Além do botão atual de "Registrar contato" (ligação), adicionar menu suspenso com atalhos:
- WhatsApp (abre `wa.me` se houver telefone + pré-registra interação).
- E-mail (abre `mailto:` + pré-registra).
- Cada ação abre o lead com o template do canal correspondente já carregado no diálogo.

### 4. Resumo no topo + meta diária
Cards-resumo no topo de `/alerts` mostrando:
- Total atrasado / em risco / contatados hoje.
- Barra de progresso de "meta de follow-ups do dia" (configurável, default 10) com base em interações criadas pelo usuário hoje.

### 5. Notificação sonora/toast em tempo real para novos atrasos
Quando o realtime detectar que um lead acabou de virar "overdue" (não apenas ao logar contato), disparar um `toast` discreto e atualizar contador no sino. Evita que vendedores percam mudanças enquanto navegam em outras telas.

## Arquivos afetados

- `src/lib/useLeadAlerts.ts` — snooze, detecção de transição p/ overdue, contador de follow-ups do dia.
- `src/routes/alerts.tsx` — filtros, busca, cards-resumo, menu de ações multi-canal, botão de snooze.
- `src/routes/leads.$leadId.tsx` — aceitar `quickContact=whatsapp|email` na URL e abrir diálogo com template do canal (parcialmente já existe).
- `src/components/NotificationBell.tsx` — toast em transição p/ overdue.
- `src/lib/i18n.tsx` — novas chaves (PT/EN/ES): snooze, filtros, meta diária, canais.

## Detalhes técnicos

- Snooze: `Map<leadId, expiresAtMs>` em `localStorage` chave `lead-alerts-snooze`. Limpeza automática de entradas expiradas no load.
- Meta diária: `count(interactions where created_by=me and occurred_at >= today)`. Configurável via `localStorage` chave `daily-followup-goal`.
- Detecção de transição overdue: comparar snapshot anterior de níveis SLA por lead; se passou de `warning|ok` para `overdue`, dispara toast.
- WhatsApp link: `https://wa.me/{phone limpo}?text={template encodeURIComponent}`.
- Mantém RLS existente; nada novo no banco.

## Fora de escopo

- Notificações push do navegador (precisa permissão explícita — fica para depois).
- Configuração de meta diária em página de settings (usar localStorage por enquanto).
- Snooze sincronizado entre dispositivos (apenas local).
