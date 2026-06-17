## Revisão dos níveis de alçada

Objetivo: deixar a hierarquia clara em 3 camadas (Desenvolvedor → Proprietário → Subordinados) e garantir que cada um só veja o que lhe cabe, mantendo a estrutura de permissões por módulo já existente.

### 1. Modelo de hierarquia (5 níveis dentro do tenant)

| Rank | Papel (`app_role`) | Quem é | Visibilidade |
|---|---|---|---|
| — | **Desenvolvedor** (super admin) | Você, no Lovable | Todos os tenants e todos os usuários |
| 6 | **Proprietário** (`owner`) | Quem criou a conta no site | Tudo dentro do próprio tenant |
| 5 | Diretoria (`diretor`) | Convidado pelo Proprietário | Seus subordinados (Gerência ↓) |
| 4 | Gerência (`gerente`) | Convidado pelo Proprietário | Seus subordinados (Coordenação ↓) |
| 3 | Coordenação (`coordenador`) | Convidado pelo Proprietário | Seus subordinados (Operação) |
| 1 | Operação (`operador`) | Convidado pelo Proprietário | Só os próprios dados |

A visibilidade segue a árvore `reports_to` (superior direto) — cada usuário vê seus subordinados diretos **e indiretos**.

### 2. Mudanças no banco

- **Novo papel `owner`** no enum `app_role` (rank acima de `diretor`).
- **Coluna `reports_to uuid`** em `profiles` (FK para `auth.users`) — define o superior direto de cada usuário convidado. Owner não tem superior; subordinados herdam a árvore a partir do Owner.
- **Painel Desenvolvedor**: criar tabela/uso de `super_admins` já existente. Função `is_developer()` (alias de `is_super_admin`) com bypass total de RLS.
- **Função `public.get_subordinates(_user_id)`** reescrita para usar `reports_to` recursivamente (CTE recursiva) em vez do rank atual. Mantém a assinatura, então as policies que já usam `is_subordinate_of` continuam funcionando sem alteração.
- **Função `public.can_invite(_inviter, _target_role)`**: só Owner do tenant (ou Desenvolvedor) pode convidar — bloqueia Diretoria/Gerência/Coordenação de convidar.
- **Trigger `handle_new_user`**: já cria Owner automaticamente em signup direto; manter. Para convites, gravar `reports_to = quem_convidou` (vindo do metadata do convite) e o papel escolhido.

### 3. Mudanças no app

- **Tela de Convite** (`/users`): só Owner (e Desenvolvedor) veem o botão "Convidar". O Select de papel oferece: Diretoria, Gerência, Coordenação, Operação. Owner não pode ser convidado — só existe um por tenant (o criador).
- **Tela de Usuários**: lista filtrada por `get_subordinates(auth.uid())` + o próprio. Owner vê todos do tenant. Desenvolvedor tem chaveador de tenant.
- **Painel Desenvolvedor** em `/dev` (rota separada, fora de `_authenticated`, com guarda própria via `is_super_admin`): lista todos os tenants, permite "entrar como" (impersonar) e ver/editar qualquer usuário. Esta tela só renderiza se o usuário logado estiver em `super_admins`.
- **Permissões por módulo**: mantidas como hoje (`role_module_permissions`). Só ajusto os defaults para incluir o novo `owner` (acesso total) e revisar os defaults de Diretoria/Gerência/Coordenação/Operação conforme você indicar — mas a estrutura de tabela não muda.

### 4. Pontos para você confirmar antes de eu rodar

1. **Quem define o `reports_to` no convite?** Como só o Owner convida, sugiro: ao convidar, ele escolhe o papel e o **superior direto** (qualquer usuário já existente com rank ≥ ao do convidado). Ex.: ao convidar um Coordenador, escolhe sob qual Gerente ele fica. Se preferir que tudo reporte direto ao Owner por padrão (e seja reorganizado depois numa tela de organograma), eu sigo assim.
2. **Defaults de permissão por papel** (criar/editar/excluir/aprovar em cada módulo: Leads, Clientes, Fornecedores, Cotações, Reservas, Financeiro, etc.) — quer que eu proponha uma matriz padrão para você revisar, ou prefere já me passar?
3. **Painel `/dev`**: login próprio = você usa o mesmo e-mail do app, e a rota só abre se estiver em `super_admins`? Ou quer um e-mail/senha completamente separado?
