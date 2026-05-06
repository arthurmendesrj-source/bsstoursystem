# Modo Espelho Completo ("Logar como" usuário)

## Problema atual
Hoje, ao clicar num usuário no Gerencial, só o **Dashboard**, **Funil** e **Leads** filtram pelo `effectiveUserId` (e ainda em modo somente leitura). Os demais módulos (Atividades, E-mails, Reservas, Clientes, Alertas, Workspace) continuam mostrando os dados do **admin logado**, porque suas queries usam `useAuth().user.id` diretamente. Resultado: o usuário só "vê" o Dashboard do alvo; o resto do app fica como se nada tivesse mudado.

## Objetivo
Quando um gestor clica num subordinado no Gerencial, o app inteiro deve se comportar como se ele estivesse **logado na conta daquele usuário**: todos os menus visíveis, todas as listagens filtradas pelo alvo, e ações (criar lead, tarefa, etc.) devem registrar o alvo como `created_by` / `assigned_to`. O banner amarelo continua no topo para deixar claro que é uma sessão espelhada, com botão para sair.

> Observação: a sessão de autenticação real continua sendo a do gestor (RLS de admin/diretor já permite ler tudo). Não é um login real — é um "contexto efetivo" aplicado em todo o frontend.

## Mudanças

### 1. `src/lib/viewAs.tsx`
- Manter `effectiveUserId()`, mas remover a flag `readOnly` (ou deixar sempre `false`). Adicionar `isImpersonating` apenas como sinalização visual.
- Exportar um helper único `useEffectiveUser()` que devolve `{ id, isImpersonating, target }` para evitar repetir `viewAs?.user_id ?? user.id` em cada arquivo.

### 2. `src/components/AppShell.tsx`
- Trocar o texto do banner para algo como:  
  *"Sessão espelhada de **Fulano** (gerente). Você está agindo como este usuário."*
- Remover o "(modo somente leitura)".
- Manter o botão "Sair da visualização".
- Esconder/desabilitar o item de menu **Gerencial** enquanto impersonando (evita loop e confusão de hierarquia).

### 3. Rotas que precisam usar `effectiveUserId()` em vez de `user.id`
Refatorar todas as queries/mutations que hoje escopam pelo usuário logado:

- `src/routes/dashboard.tsx` — KPIs, listas (já parcialmente feito; revisar).
- `src/routes/funnel.tsx` — leads do board; remover bloqueio de drag-and-drop.
- `src/routes/leads.tsx` — listagem + criação (`created_by`, `assigned_to`); reabilitar botão "Novo lead".
- `src/routes/activities.tsx` — listagem de tarefas e criação.
- `src/routes/alerts.tsx` — `useLeadAlerts(effectiveId)`, templates, metas.
- `src/routes/bookings.tsx` — listagem e criação.
- `src/routes/customers.tsx` — listagem e criação.
- `src/routes/workspace.tsx` — todas as 3 telas (lead, booking, task).
- `src/components/email/EmailPanel.tsx` — caixa de entrada filtrada pelo alvo.

Padrão da refatoração:
```ts
const { id: effectiveId, isImpersonating } = useEffectiveUser();
// queries: .eq("assigned_to", effectiveId) etc.
// inserts: created_by: effectiveId, assigned_to: effectiveId
```

### 4. Gerencial
- `src/routes/gerencial.tsx`: ao clicar na linha, chama `enterViewAs(...)` e navega para `/dashboard` (já faz). Mantém igual.
- `src/routes/gerencial.$userId.tsx`: continua sendo o relatório consolidado (acessível pelo link "Relatório" da tabela), separado do modo espelho.

### 5. Permissões / RLS
Não há mudança de banco. As policies já permitem que admin/diretor/gerente leiam dados dos subordinados (via `is_subordinate_of` / `is_admin`), então as queries com `effectiveId` vão funcionar sem ajustar RLS. **Inserts** com `created_by = effectiveId` precisam ser validados — se alguma policy de INSERT exigir `created_by = auth.uid()`, ela falhará. Vou rodar o linter de RLS depois da refatoração e, se necessário, ajustar a policy da tabela afetada (provavelmente `leads`, `tasks`, `bookings`, `customers`) para permitir inserir em nome de subordinado quando `is_admin(auth.uid())` ou `is_subordinate_of(target, auth.uid())`.

## Critérios de aceitação
- Clicar num usuário no Gerencial → app inteiro passa a mostrar dados dele em todos os menus (Dashboard, Leads, Funil, Atividades, Alertas, Reservas, Clientes, E-mails, Workspace).
- Banner amarelo no topo identifica claramente que é sessão espelhada e oferece "Sair".
- Criar um lead/tarefa enquanto impersonando grava `created_by` e `assigned_to` como o usuário-alvo.
- Sair da visualização restaura instantaneamente a visão do gestor.
- Menu "Gerencial" some/desabilita durante a impersonação.
