## Fase 2.1 — Histórico (activity_log)

Auditoria de mudanças em leads, cotações e reservas, com timeline por entidade.

### O que será entregue
- Tabela `activity_log` no backend (Lovable Cloud) registrando criação, atualização e mudança de status de `leads`, `quotes` e `bookings`.
- Triggers no banco para gravar automaticamente cada mudança (sem precisar alterar código de cada formulário).
- Componente de UI `ActivityTimeline` reutilizável que lista os eventos de uma entidade em ordem cronológica reversa, com:
  - ícone por tipo de ação (criou, atualizou, mudou status, vinculou)
  - autor (nome do profile)
  - data/hora relativa ("há 2h")
  - diff resumido dos campos alterados (ex.: `status: novo → qualificado`)
- Integração da timeline nos detalhes de Lead, Cotação e Reserva.
- Traduções PT/EN/ES.

### Detalhes técnicos

**Migration**
- `activity_log` com colunas:
  - `id uuid pk`, `entity_type text` (lead/quote/booking), `entity_id uuid`, `action text` (created/updated/status_changed), `changes jsonb` (campos alterados com old/new), `actor_id uuid` (auth.uid), `created_at timestamptz default now()`.
- Índice em `(entity_type, entity_id, created_at desc)`.
- RLS: SELECT para authenticated; INSERT só via trigger (sem policy de insert direto, ou policy permitindo `auth.uid() = actor_id`).
- Função `public.log_activity()` SECURITY DEFINER que, em AFTER INSERT/UPDATE, calcula o diff (apenas colunas relevantes) e insere em `activity_log`. Para UPDATE compara `OLD` vs `NEW` apenas em campos relevantes (status, datas, valores, vínculos) para evitar ruído.
- Triggers `AFTER INSERT OR UPDATE` em `leads`, `quotes`, `bookings`.

**Frontend**
- Novo componente `src/components/ActivityTimeline.tsx` com props `entityType` e `entityId`. Usa `supabase.from('activity_log')` com filtros e ordenação. Faz join leve com `profiles` para nome do autor (query separada por actor_ids únicos).
- Renderização compacta com `Card`, ícones do `lucide-react` (Plus, Edit, ArrowRightLeft, Link2), badges para status.
- Helper `formatChanges(changes)` que itera o jsonb e produz linhas legíveis com mapeamento de nomes de campos traduzidos.

**Integração**
- Adicionar `<ActivityTimeline entityType="lead" entityId={lead.id} />` na tela/drawer de detalhe do lead. Idem para cotação e reserva (localizar telas existentes em `src/pages` / `src/components`).

**i18n**
- Chaves: `activity.title`, `activity.created`, `activity.updated`, `activity.statusChanged`, `activity.by`, `activity.empty`, e nomes de campos comuns (status, valor, data, etc.).

### Fora de escopo desta fase
- Edição/exclusão de eventos (log é imutável).
- Comentários manuais na timeline (pode virar fase 2.1.1 depois).
- SLA de leads e Dashboard (fases 2.2 e 3).