## Objetivo

Ao clicar em um lead na lista da página `/leads`, o usuário deve ser direcionado para a tela de Atendimento (`/workspace`) já com o lead selecionado, em vez de ir para a página de detalhe atual (`/leads/:id`).

## Mudança

Arquivo único: `src/routes/leads.tsx`

- Trocar o `onClick` da linha da tabela (linha 148) que hoje faz `window.location.assign('/leads/${id}')` por uma navegação tipada do TanStack Router para `/workspace` com o parâmetro de busca `lead=<id>`.
- Importar `useNavigate` de `@tanstack/react-router` e instanciar `const navigate = useNavigate()` dentro do componente.
- Handler: `navigate({ to: "/workspace", search: { lead: l.id } })`.
- Manter o `cursor-pointer` e o `stopPropagation` da célula de ações (linha 156) intactos.

A rota `/workspace` já aceita `?lead=<id>` (vide `validateSearch` em `src/routes/workspace.tsx`) e carrega automaticamente o lead, abrindo a tela de atendimento com ele.

## Observação

A rota `/leads/$leadId` continua existindo e acessível por URL direta — apenas o clique padrão da lista passa a ir para o workspace. Caso queira no futuro removê-la ou redirecioná-la, é uma decisão à parte.