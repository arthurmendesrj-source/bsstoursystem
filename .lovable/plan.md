## Aba "Atividades" — Gestão de tarefas e fluxo de trabalho

Nova seção centralizada para o operador visualizar e gerenciar todas as tarefas: as vinculadas a leads (com código do lead) e as avulsas (criadas manualmente ou a partir de e-mails), com base para análise futura de tempo.

### 1. Banco de dados (migração)

Estender a tabela `tasks` existente (já usada em `leads.$leadId.tsx`) com campos para suportar tarefas avulsas e tracking de tempo:

- `category text` — `'negocio'` (vinculada a lead/cliente) ou `'suporte'` (avulsa). Default deriva: tem `lead_id`/`customer_id` → `negocio`, senão → `suporte`.
- `priority text` — `'baixa' | 'media' | 'alta'`, default `'media'`.
- `started_at timestamptz` — quando o operador iniciou a execução.
- `completed_at timestamptz` — preenchido ao marcar como concluída (trigger).
- `time_spent_minutes integer` — tempo gasto (manual ou calculado de `started_at`/`completed_at`).
- `source text` — `'manual' | 'email' | 'lead'`, indica origem.
- `email_id uuid` — referência opcional para `emails.id` quando criada a partir de um e-mail.

Trigger: ao mudar `completed` de false→true, setar `completed_at = now()` e, se `started_at` estiver setado e `time_spent_minutes` for null, calcular automaticamente.

RLS: já existe (`Assigned or admin read tasks`, etc.) — manter.

### 2. Nova rota `/activities`

Arquivo: `src/routes/activities.tsx` (envolto em `AuthGate` + `AppShell`).

Layout em três áreas:

**Topo — filtros e métricas rápidas:**
- Filtros: status (todas / abertas / concluídas / em andamento), categoria (negócio / suporte / todas), prioridade, intervalo de datas, atribuída a (admin vê todos, operador vê só as suas).
- Cards de resumo: total aberto, vencidas, concluídas hoje, tempo total gasto na semana.

**Centro — lista de tarefas (tabela):**
Colunas: status (checkbox para concluir), título, código do lead (badge clicável → `/leads/$leadId`) ou "Avulsa", categoria, prioridade, prazo, atribuída a, tempo gasto.

Ações por linha:
- Iniciar/Pausar (seta `started_at`).
- Concluir (toggle `completed`).
- Editar (abre dialog).
- Ver lead (se vinculada).

**Botão "+ Nova atividade"** abre dialog com:
- Título, descrição, prazo, prioridade, categoria.
- Vincular a lead (autocomplete opcional sobre `leads`).
- Vincular a cliente (autocomplete opcional).
- Atribuir a (admin pode escolher; operador é auto).

### 3. Item na sidebar

Em `src/components/AppShell.tsx`, adicionar entrada `{ to: "/activities", label: t("activities"), icon: ListChecks }` no array `items`, posicionada logo após "Funil" (faz sentido no fluxo de trabalho).

### 4. Integração com e-mail

Em `src/components/email/EmailPanel.tsx` (e/ou rota `/email`), adicionar botão "Criar atividade" no detalhe de e-mail que pré-preenche o dialog de nova atividade com:
- `source: 'email'`, `email_id` setado, título sugerido a partir do `subject`, descrição com snippet, lead/cliente já vinculado se o e-mail tiver `lead_id`/`customer_id`.

### 5. Integração com lead

Em `src/routes/leads.$leadId.tsx`, o card "Schedule" já cria tarefas — apenas garantir que setam `category = 'negocio'` e `source = 'lead'`. As tarefas continuam aparecendo lá; a aba Atividades é a visão consolidada.

### 6. i18n

Em `src/lib/i18n.tsx`, adicionar strings (pt/en/es): `activities`, `newActivity`, `category`, `categoryBusiness`, `categorySupport`, `priority`, `priorityLow/Medium/High`, `startTask`, `pauseTask`, `timeSpent`, `dueIn`, `overdue`, `unassigned`, `linkedLead`, `linkedCustomer`, `loose` (avulsa), `openTasks`, `completedToday`, `weekTimeTotal`.

### Fora de escopo
- Relatórios analíticos avançados (apenas cards de resumo nesta primeira versão; análise detalhada de tempo fica para iteração futura).
- Notificações push / lembretes por e-mail.
- Recorrência de tarefas.

### Detalhes técnicos

- Migração SQL via tool de migrações (ALTER TABLE tasks ADD COLUMN ...; CREATE TRIGGER set_task_completed_at).
- Cliente: usar `supabase` browser client com filtros server-side (`.eq`, `.gte`, `.is`).
- Realtime opcional na primeira versão.
- Autocomplete de lead/cliente: `select id,code,name` com `ilike` no termo digitado, debounced.
