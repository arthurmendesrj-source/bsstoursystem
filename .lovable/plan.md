## Atualizações de tarefas com Salvar / Encerrar

Adicionar um editor inline que abre ao clicar em uma atividade, tanto na aba **Atividades** dentro do lead (Atendimento → `/workspace`) quanto na página **/activities**.

### Comportamento

- Clicar na linha/cartão da atividade expande um painel logo abaixo com:
  - `Textarea` (placeholder "Descreva a atualização desta tarefa…").
  - Histórico das atualizações anteriores acima do textarea (lista compacta com data/hora + autor).
  - Dois botões:
    - **Salvar** → grava a atualização e mantém a tarefa aberta.
    - **Encerrar** → grava a atualização e marca a tarefa como concluída (`completed = true`, `completed_at = now()`).
- Clicar de novo (ou em "Cancelar") fecha o painel sem mudar nada.
- Botão check existente continua funcionando (encerramento rápido sem texto).

### Onde salvar as atualizações

Usar a tabela existente **`interactions`** (já tem RLS, `lead_id`, `created_by`, `occurred_at`, `subject`, `content`, `type`).

- `type`: `nota` (valor já usado no enum no projeto — confirmar no carregamento; se o enum não tiver, usar o valor padrão de "nota/observação" disponível).
- `subject`: `"Atualização: " + task.title`
- `content`: texto digitado
- `lead_id`: `task.lead_id` (quando houver)
- `created_by`: `auth.uid()`

Vantagem: aparece automaticamente na timeline do lead (`ActivityTimeline`) e respeita as RLS já configuradas. Não precisa de migração.

Para listar o histórico de updates de uma tarefa específica, filtrar `interactions` por `lead_id = task.lead_id` + `subject ilike 'Atualização: ' || task.title || '%'`. (Solução simples sem nova coluna; se o usuário preferir vínculo direto `task_id`, podemos adicionar coluna depois.)

### Arquivos alterados

1. **`src/routes/workspace.tsx`** — `ActivitiesTab`:
   - Estado `expandedTaskId`, `updateText`, `updateHistory` (Map por taskId).
   - Ao clicar no cartão da tarefa (área que não é o check/lixeira), alterna expansão e carrega histórico via `supabase.from("interactions").select(...)`.
   - Painel expandido com Textarea + botões Salvar / Encerrar / Cancelar.
   - `saveUpdate(task, alsoComplete)` → insere em `interactions`; se `alsoComplete`, faz `update({ completed: true, completed_at: now() })` em `tasks`. Recarrega lead via `onChanged()`.

2. **`src/routes/activities.tsx`**:
   - Mesma lógica: linha da tabela vira clicável (toggle expansão), e abaixo dela renderiza `<TableRow>` extra com `colSpan` total contendo o painel (histórico + textarea + Salvar/Encerrar/Cancelar).
   - Reaproveitar `loadTasks()` para refresh.

3. **`src/lib/i18n.tsx`** — adicionar (pt/en/es):
   - `taskUpdate`: "Atualização"
   - `taskUpdatePlaceholder`: "Descreva a atualização desta tarefa…"
   - `save`: já existe? senão adicionar
   - `closeTask`: "Encerrar"
   - `cancel`: já existe
   - `noUpdatesYet`: "Sem atualizações"

### Observações

- "Encerrar" usa o mesmo caminho do toggle atual (`completed = true, completed_at = now()`); o trigger `handle_task_completion` cuida de `time_spent_minutes` se `started_at` existir.
- Não toca em RLS nem schema; nenhum migration necessário.
- Na `/activities`, o clique na linha precisa ignorar cliques nos botões existentes (check, vincular, etc.) — usar `e.stopPropagation()` nos botões.
