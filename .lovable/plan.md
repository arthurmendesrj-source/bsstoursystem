## Atribuir + notificar destinatário em Atividades

Combina o ajuste anterior (criar/visualizar para todos, editar só pelo destinatário ou superior) com o novo: **notificar o destinatário quando recebe uma tarefa nova**.

### 1. UI — `src/routes/activities.tsx`
- Substituir `useSubordinates()` por busca completa de `profiles (user_id, full_name)` ordenada por nome.
- Mostrar o select "Atribuir a" sempre (não condicional), com "Eu mesmo" + todos os usuários. Default = "Eu mesmo".
- Helper `canEdit(task)` = `assigned_to == me || is_admin || is_subordinate_of(assigned_to, me)`. Aplicar em:
  - botão concluir / reabrir
  - play/pause de timer
  - dialog de edição e edição em massa
  - botão excluir (mantém regra de criador/admin no DELETE)
  - badge "somente leitura" quando bloqueado.
- Visualização (lista, filtros, stats) liberada para todos.
- Após `insert` bem-sucedido, se `assigned_to` ≠ usuário atual, chamar `notifyTaskAssigned({ taskId })` (server function nova) — falha silenciosa.

### 2. Banco — RLS de `public.tasks`
Substituir policies atuais:
- **SELECT**: `auth.role() = 'authenticated'`.
- **INSERT**: `auth.uid() = created_by`.
- **UPDATE**: `auth.uid() = assigned_to OR is_admin(auth.uid()) OR is_subordinate_of(assigned_to, auth.uid())`.
- **DELETE**: criador ou admin (mantém).

### 3. Notificação ao destinatário
**Server function nova** `src/server/tasks.functions.ts` → `notifyTaskAssigned`:
- Input: `{ taskId: uuid }`.
- Lê a task via cliente do usuário (RLS valida acesso).
- Se `assigned_to` existe e é diferente do ator, dispara `sendPushToUser` (já existente em `src/server/push.server.ts`):
  - title: "Nova atividade atribuída a você"
  - body: título da tarefa
  - url: `/leads/{lead_id}` se houver, senão `/activities`
  - tag: `task-assigned-{id}`
  - eventType: `lead_assigned` (reusa preferência existente — sem migrar enum agora).
- O helper já registra em `notification_logs` automaticamente.

### Fora do escopo
- Não criar novo `eventType` em `notification_preferences` (reusa `lead_assigned` para respeitar opt-out).
- Sem notificação quando a task é **reatribuída** depois (só na criação).
- Sem mexer em outras tabelas (leads, bookings).
- Sem filtro por equipe/papel no select.
