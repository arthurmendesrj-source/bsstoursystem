# Replica completa da tela do usuário no modo espelho

## Diagnóstico

Hoje, ao clicar num usuário no Gerencial, o app navega para `/dashboard` e mostra o banner amarelo, mas a **barra lateral (sidebar) e os itens de menu continuam baseados no usuário logado (gestor)**. Pior: o menu "Gerencial" some, e o usuário fica com a sensação de que "só o Dashboard apareceu", porque:

1. Não há sinalização de que ele *pode* clicar nos outros itens (Leads, Funil, Atividades, etc.) — os dados ali ainda eram do gestor até as últimas correções, então parecia "não funcionar".
2. A sidebar reflete os **papéis do gestor**, não os do alvo. Itens administrativos (Usuários, Auditoria, Configurações > Permissões/SLA) aparecem quando o gestor é admin, mesmo se o alvo for um operador. Isso quebra a ilusão de "estou logado como ele".
3. Em telas mais estreitas a sidebar `md:flex` simplesmente não aparece, e não há menu mobile/hamburguer — então em viewport reduzida o usuário só vê o conteúdo da rota atual.

O objetivo agora é: **quando o gestor está em modo espelho, o app deve parecer 100% a tela daquele usuário** — sidebar visível, com exatamente os itens que aquele usuário veria, toolbar, banner identificando, e navegação livre por todas as abas.

## Plano

### 1. `src/lib/viewAs.tsx` — carregar papéis do alvo

- Adicionar fetch dos `user_roles` do `viewAs.user_id` (quando impersonando) e expor `targetRoles: AppRole[]` no contexto.
- Cachear na sessionStorage junto com o target para não piscar a UI ao recarregar.

### 2. `src/lib/auth.tsx` ou helper novo `useEffectiveRoles()`

- Criar hook `useEffectiveAuth()` que devolve `{ userId, roles, isAdmin, hasRole }` baseado no alvo da impersonação se houver, senão no usuário real.
- Lógica:
  ```ts
  const { user, roles: realRoles, isAdmin: realIsAdmin, hasRole: realHasRole } = useAuth();
  const { viewAs, targetRoles } = useViewAs();
  if (!viewAs) return { userId: user?.id, roles: realRoles, isAdmin: realIsAdmin, hasRole: realHasRole };
  return {
    userId: viewAs.user_id,
    roles: targetRoles,
    isAdmin: targetRoles.includes("admin"),
    hasRole: (r) => targetRoles.includes(r),
  };
  ```

### 3. `src/components/AppShell.tsx` — renderizar como o alvo

- Trocar `useAuth()` (para gating de menu) por `useEffectiveAuth()`. O `signOut` continua vindo de `useAuth()` (gestor real).
- Resultado: sidebar mostra itens conforme o papel do alvo (operador não vê "Usuários", admin vê tudo, etc.).
- Cabeçalho: mostrar nome do alvo no canto + badge "Espelho" ao lado do email.
- Banner amarelo: continuar, com texto "Sessão espelhada de **Fulano** (papel) — agindo como este usuário" + botão "Sair da visualização".
- "Gerencial" continua oculto durante a impersonação (evita loop).
- **Adicionar botão hamburguer** (`md:hidden`) para abrir a sidebar como Sheet em viewports menores, garantindo que o menu nunca fique invisível.

### 4. Reforçar `useEffectiveUser()` nas rotas restantes

Já foi feito em `dashboard`, `funnel`, `leads`, `activities`, `bookings`. Falta:
- `customers.tsx`
- `alerts.tsx` (passar `effectiveId` para `useLeadAlerts`)
- `workspace.tsx`
- `email/EmailPanel.tsx`
- `itineraries.tsx` se relevante

Padrão: query usa `effectiveId`; inserts gravam `created_by/assigned_to = effectiveId` (mantendo `created_by = auth.uid()` quando RLS exigir).

### 5. RLS (verificação, sem mudança planejada)

Rodar o linter de Supabase após as mudanças. Se algum INSERT falhar por exigir `created_by = auth.uid()`, ajustar a policy daquela tabela para permitir `is_admin(auth.uid()) OR is_subordinate_of(target, auth.uid())`. Não há mudança preventiva — só reativa.

## Critérios de aceitação

- Clicar num usuário no Gerencial → app inteiro vira a "tela dele": sidebar com os itens que **ele** veria, todas as abas navegáveis, dados filtrados por ele.
- Sidebar permanece visível (ou acessível via hamburguer em telas pequenas).
- Banner amarelo identifica claramente "sessão espelhada" + botão sair.
- Operações (criar lead/tarefa/reserva) gravam com o usuário-alvo como dono.
- Sair da visualização restaura instantaneamente a visão do gestor (com "Gerencial" de volta no menu).
