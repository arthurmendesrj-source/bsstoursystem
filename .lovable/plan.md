## Fase 2.2 — SLA de leads

Alertas para leads parados, indicando risco no funil e no dashboard.

### O que será entregue

1. **Regras de SLA (por status)** — config central em `src/lib/leadSla.ts`:
   - `novo`: 2 dias sem interação
   - `qualificado`: 5 dias
   - `cotacao` / `proposta`: 7 dias
   - `fechado` / `perdido`: ignorados
   - Lead em risco também quando `next_action_date < hoje`.
   - Função `computeLeadSla(lead, lastInteractionAt)` retornando `{ level: "ok"|"warning"|"overdue", daysSinceLast, threshold, nextActionOverdue, reason }`.

2. **Indicador no funil (`/funnel`)**
   - Buscar `last_interaction_at` por lead (consulta agregada em `interactions` agrupada por `lead_id`).
   - Adicionar badge de status no card: ponto âmbar para `warning`, vermelho para `overdue`, com tooltip explicando "X dias sem contato" / "ação atrasada".
   - Filtro rápido no topo: "Todos | Em risco | Atrasados".

3. **Bloco "Leads em risco" no Dashboard (`/dashboard`)**
   - Card adicional com top 5 leads em `overdue`, mostrando nome, status, dias parado e link para `/leads/$id`.
   - Contador agregado nos KPIs ("X leads em risco").

4. **i18n PT/EN/ES**
   - `slaAtRisk`, `slaOverdue`, `slaDaysIdle`, `slaNextActionOverdue`, `slaFilterAll`, `slaFilterRisk`, `slaFilterOverdue`, `dashAtRisk`.

### Detalhes técnicos

- **Sem migration necessária**: `leads.updated_at`, `leads.next_action_date` e `interactions.occurred_at` já existem.
- Carregamento no funil:
  ```ts
  const { data } = await supabase
    .from("interactions")
    .select("lead_id, occurred_at")
    .order("occurred_at", { ascending: false });
  // reduce → { [lead_id]: maxOccurredAt }
  ```
  Para volumes grandes futuramente, dá para promover a uma view materializada ou função SQL; nesta fase, agregação client-side basta.
- Tooltip usando `@/components/ui/tooltip` (já presente no shadcn).
- Badge: ponto colorido + texto curto, sem alterar layout dos cards.

### Fora de escopo
- Notificação push/e-mail de SLA estourado (futura Fase 2.2.1).
- Configuração editável dos thresholds por usuário/admin (depois — começamos com config no código).
- Dashboard com KPIs gerenciais completos (Fase 3).