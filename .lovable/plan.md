## Objetivo
Criar uma aba **Gerencial** (somente leitura) para **Admin, Diretor e Gerente** consultarem a performance dos seus subordinados — com visão **consolidada** e **drill-down por usuário** (atividades, leads, e-mails, dashboard, funil).

## Acesso
Visível no menu lateral apenas se `isAdmin || hasRole('diretor') || hasRole('gerente')`. Demais papéis: redirect para `/dashboard`. Lista de usuários vem do hook existente `useSubordinates()` (admin → todos; diretor → gerente+supervisor+operador; gerente → supervisor+operador).

## Rotas (novas)

### `/gerencial` — Visão consolidada
Cabeçalho com filtros globais:
- Período (7d / 30d / 90d / customizado)
- Filtro por papel (todos / gerente / supervisor / operador)
- Busca por nome

**KPIs agregados** (somando todos os subordinados no período):
- Leads novos / em andamento / fechados / perdidos
- Taxa de conversão (fechados ÷ total)
- Receita confirmada (bookings)
- Tarefas pendentes / vencidas / concluídas
- E-mails recebidos / não lidos
- Leads em risco SLA

**Mini-funil consolidado** (mesmos status do `/funnel` somando todos subordinados).

**Tabela ranking de usuários** — uma linha por subordinado com:
| Nome | Papel | Leads ativos | Convertidos | Receita | Tarefas pendentes | Tarefas vencidas | E-mails não lidos | SLA risco |

Cada linha clicável → `/gerencial/$userId`.

### `/gerencial/$userId` — Visão individual
Header com nome/papel do usuário + botão "voltar".

Abas internas (Tabs do shadcn):
1. **Dashboard** — mesmos KPIs do `/dashboard`, mas filtrados por `assigned_to = userId OR created_by = userId`.
2. **Funil** — pipeline de leads desse usuário (reutiliza lógica do `/funnel`).
3. **Leads** — tabela read-only dos leads atribuídos/criados por ele (sem botões de edit/criar).
4. **Atividades** — lista de tarefas (`operations_activities`) onde `created_by = userId`.
5. **E-mails** — e-mails da `emails` table relacionados a leads desse usuário (read-only, sem responder).

Todos os componentes em **modo somente leitura**: nenhum botão "Novo", "Editar", "Excluir" — apenas consulta.

## Arquivos a criar
- `src/routes/gerencial.tsx` — layout/index com KPIs consolidados + tabela de ranking.
- `src/routes/gerencial.$userId.tsx` — view individual com Tabs.
- `src/components/gerencial/ConsolidatedKpis.tsx` — cards de KPI agregados.
- `src/components/gerencial/UserRankingTable.tsx` — tabela ordenável.
- `src/components/gerencial/UserDashboardView.tsx` — KPIs filtrados por user.
- `src/components/gerencial/UserFunnelView.tsx` — funil filtrado.
- `src/components/gerencial/UserLeadsView.tsx` — tabela read-only de leads.
- `src/components/gerencial/UserActivitiesView.tsx` — tabela read-only de tarefas.
- `src/components/gerencial/UserEmailsView.tsx` — lista read-only de e-mails.
- `src/lib/managerial.ts` — helpers de query (agregações por user_id, no período).

## Arquivos a editar
- `src/components/AppShell.tsx` — adicionar item "Gerencial" no menu (visível apenas para admin/diretor/gerente).
- `src/lib/i18n.tsx` — chave `managerial` / `Gerencial`.

## Sem mudanças de banco
Todas as RLS atuais já permitem que admin/diretor/gerente leiam leads/atividades/emails dos subordinados via `is_subordinate_of`. Nenhuma migração necessária.

## Fora do escopo
- Edição/criação/distribuição em massa nesta aba (já existe nos módulos próprios).
- Exportação CSV (pode vir depois).
- Gráficos avançados — nesta primeira versão usamos cards numéricos + tabelas + funil simples.
- Comparação entre períodos / metas individuais.
