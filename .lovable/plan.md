## Objetivo

Reorganizar a barra lateral em **módulos colapsáveis**, começando pelo módulo **CRM**, que agrupa: Dashboard, Leads, Funil de Atendimento, Atendimento (Workspace) e Pacotes.

## Comportamento

- A barra lateral passa a exibir o item **CRM** com ícone próprio (ex.: `LayoutGrid`) e um chevron à direita indicando estado.
- Clique em **CRM** → expande verticalmente abaixo, mostrando os 5 sub-itens (Dashboard, Leads, Funil, Atendimento, Pacotes), cada um com seu ícone atual, recuados (`pl-9`) seguindo o padrão já usado em "Configurações → Templates / SLA / Permissões".
- Clique novamente em **CRM** → recolhe os sub-itens.
- Estado expandido/recolhido é persistido em `localStorage` (`sidebar:group:crm`) e inicia **expandido** caso a rota atual seja uma das filhas do CRM.
- Quando a sidebar inteira está colapsada (modo ícone, `w-16`): clicar no ícone CRM expande a sidebar e abre o grupo.
- O item CRM fica **ativo** (mesmo destaque dos demais) quando a rota atual for `/dashboard`, `/leads`, `/funnel`, `/workspace` ou `/packages`.

> Observação: "Atendimento" corresponde ao item atual **Workspace** (rota `/workspace`, ícone `Briefcase`). O rótulo no menu passa a ser "Atendimento". Caso prefira manter "Workspace", basta avisar.

## Mudanças no código

Arquivo único: `src/components/AppShell.tsx`

1. Remover do array `items` os itens que migram para CRM: `dashboard`, `leads`, `funnel`, `packages`.
2. Remover o `<Link>` solto do Workspace e movê-lo para dentro do grupo CRM como "Atendimento".
3. Adicionar estado `crmOpen` (com persistência em `localStorage`) e auto-abrir quando `path` casar com qualquer rota filha.
4. Renderizar o cabeçalho clicável "CRM" (mesmas classes de `itemClass`) + chevron animado, e os filhos condicionalmente abaixo, usando o mesmo padrão de recuo dos subitens existentes.
5. Sem mudanças de rotas, traduções ou lógica de negócio. Demais itens (Alertas, Atividades, Clientes, Fornecedores, Reservas, Bíblia, Roteiros, Email, Gerencial, Admin, Configurações) permanecem inalterados.

## Fora do escopo

- Demais módulos (Operacional, Comercial, Configurações etc.) serão agrupados depois, conforme você definir.

## Critério de aceite

- Item "CRM" aparece na sidebar com ícone e chevron.
- Clicar alterna expandir/recolher os 5 filhos: Dashboard, Leads, Funil, Atendimento, Pacotes.
- Estar em qualquer rota filha abre o grupo automaticamente e marca CRM como ativo.
- Estado persiste ao recarregar a página.
- Nenhuma rota deixa de funcionar; nenhum outro item do menu é afetado.
