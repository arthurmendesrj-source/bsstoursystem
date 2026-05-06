## Modo "Visualizar como usuário" (impersonação visual)

Ao clicar em um usuário no /gerencial, o app inteiro passa a mostrar os dados daquele usuário (leads, tarefas, e-mails, dashboard, funil), mantendo você logado na sua conta. Você continua sendo o autor real de qualquer ação administrativa (reatribuir lead, marcar tarefa concluída), mas a navegação simula a experiência dele.

### 1. Contexto global de impersonação

Criar `src/lib/viewAs.tsx` com `ViewAsProvider` e hook `useViewAs()`:
- Estado: `{ viewAsUserId, viewAsName, viewAsRole }` persistido em `sessionStorage`.
- Métodos: `enterViewAs(user)`, `exitViewAs()`.
- Guard de segurança no provider: só ativa se o usuário logado for admin/diretor/gerente E o alvo estiver em `useSubordinates()`. Caso contrário, limpa.
- Helper `effectiveUserId()` que retorna `viewAsUserId ?? auth.user.id`.

Montar o provider em `src/router.tsx` (ou no `__root.tsx`) dentro do `AuthProvider`.

### 2. Banner global de impersonação

Em `src/components/AppShell.tsx`, renderizar um banner fixo no topo quando `viewAsUserId` estiver ativo:
- Texto: "Visualizando como **{nome}** ({papel}) — modo somente leitura".
- Botão "Sair da visualização" → `exitViewAs()` + redireciona para `/gerencial`.
- Cor de destaque (`bg-amber-500/15 border-amber-500/40`) para deixar evidente.

### 3. Disparo da impersonação no Gerencial

Em `src/routes/gerencial.tsx`, na linha do ranking:
- Trocar a navegação de `/gerencial/$userId` por: `enterViewAs({user_id, full_name, role})` e em seguida `navigate({ to: "/dashboard" })`.
- Manter um link "Ver detalhes" pequeno que continua indo a `/gerencial/$userId` (relatório consolidado read-only já existente).

### 4. Filtragem das páginas pelo usuário visualizado

Em cada rota relevante, ler `useViewAs()` e usar `effectiveUserId()` no lugar de `user.id` ao montar as queries Supabase:
- `src/routes/dashboard.tsx`
- `src/routes/funnel.tsx`
- `src/routes/leads.tsx` (filtrar por `assigned_to`)
- `src/routes/leads.$leadId.tsx` (apenas exibir; ocultar botões de edição quando em viewAs — ver §5)
- `src/routes/activities.tsx`
- `src/routes/email.tsx` (filtrar por `lead_id` dos leads do usuário; Gmail OAuth permanece o do gestor — e-mails exibidos vêm da tabela `emails` filtrada)
- `src/routes/bookings.tsx`, `src/routes/customers.tsx`, `src/routes/itineraries.tsx`, `src/routes/workspace.tsx` quando aplicável.

RLS continua garantindo o acesso (admin/diretor/gerente já enxergam subordinados). Nenhuma migration necessária.

### 5. Modo somente-leitura + ações administrativas

Criar helper `useReadOnly()` em `viewAs.tsx`: `readOnly = !!viewAsUserId`.

Regra geral nas páginas filtradas:
- Esconder botões de **criar**, **editar**, **excluir**, **enviar e-mail**, **adicionar nota**, **upload**.
- Manter visíveis e funcionais somente as **ações administrativas** que o gestor já tem permissão:
  - Reatribuir lead (campo `assigned_to`).
  - Marcar tarefa como concluída / reabrir.
- Inputs editáveis recebem `disabled={readOnly && !isAdminAction}`.

Implementação prática: passar `readOnly` para componentes de detalhe (`LeadDetail`, `TaskUpdatesPanel`, `EmailPanel`, etc.) e condicionar a renderização dos botões.

### 6. Navegação e proteções

- `AuthGate` permanece exigindo login do gestor real.
- Se `viewAsUserId` apontar para um id que sumiu da lista de subordinados (mudança de hierarquia), `ViewAsProvider` chama `exitViewAs()` automaticamente.
- O menu "Gerencial" continua visível durante a impersonação para permitir trocar de usuário ou sair.

### 7. Auditoria

Toda escrita continua usando `auth.uid()` real do gestor, então o `activity_log` registra corretamente quem executou a ação. Opcional: adicionar `viewing_as` no payload de notas/atividades em uma iteração futura.

### Arquivos a criar
- `src/lib/viewAs.tsx`

### Arquivos a editar
- `src/router.tsx` ou `src/routes/__root.tsx` (montar provider)
- `src/components/AppShell.tsx` (banner)
- `src/routes/gerencial.tsx` (disparar impersonação)
- `src/routes/dashboard.tsx`, `funnel.tsx`, `leads.tsx`, `leads.$leadId.tsx`, `activities.tsx`, `email.tsx`, `bookings.tsx`, `customers.tsx`, `itineraries.tsx`, `workspace.tsx` (usar `effectiveUserId` + `readOnly`)

### Fora do escopo
- Login real (sessão Supabase) na conta do subordinado.
- Migrations de RLS (políticas atuais já permitem leitura pelo gestor).
