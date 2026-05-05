## Objetivo

Na rota `/workspace` (Atendimento), incluir uma nova aba **Atividades** dentro do `<Tabs>` principal (ao lado de Email, Propostas, Fatura, Reserva), permitindo associar/criar atividades ao Lead atualmente selecionado — sem precisar sair da tela.

## Mudanças

### 1. `src/routes/workspace.tsx`
- Mudar `<TabsList className="grid grid-cols-4">` para `grid-cols-5` e adicionar `<TabsTrigger value="activities">{t("activities")}</TabsTrigger>`.
- Adicionar `<TabsContent value="activities">` que renderiza `<ActivitiesTab leadId={lead.id} />` quando há lead selecionado, ou `<EmptyTab>` caso contrário.
- Criar componente local `ActivitiesTab`:
  - Carrega `tasks` do Supabase filtrando por `lead_id` (campos: id, title, description, due_date, priority, category, completed, started_at, completed_at, source).
  - Formulário compacto inline para criar nova atividade: título (obrigatório), descrição, due_date (datetime-local), prioridade (baixa/média/alta). Insere com `category='negocio'`, `source='manual'`, `lead_id`, `created_by=user.id`, `assigned_to=user.id`.
  - Lista as atividades com checkbox de concluir, badge de prioridade, data de vencimento (destaque vermelho se atrasada), botão Iniciar/Pausar (toggle `started_at`) e botão Excluir.
  - Após qualquer ação, recarrega a lista local e também chama `onChanged` para atualizar `sortedTasks` da sidebar.
- Reaproveitar a lista de tasks já carregada em `loadLead` (não duplicar fetch — passar `tasks` por props e fazer mutações via supabase + `loadLead(lead.id)`).

### 2. `src/lib/i18n.tsx`
- Reaproveitar chaves existentes (`activities`, `newActivity`, `activityTitle`, `description`, `dueDate`, `priority`, `priorityLow/Medium/High`, `save`, `delete`, `startTask`, `pauseTask`, `selectLeadToView`). Não precisa adicionar nada novo.

## Detalhes técnicos

- O `Task` type local em workspace já tem (id, title, description, due_date, completed) — estender com `priority`, `started_at`, `completed_at` no select do `loadLead` e no type, para suportar a UI nova.
- O insert respeita as RLS (`created_by = auth.uid()`).
- A aba não substitui a página `/activities`; é um atalho contextual ao Lead aberto.