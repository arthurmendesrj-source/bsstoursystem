## Objetivo

Adicionar um buscador global no cabeçalho do app, com ícone de lupa posicionado ao lado do ícone de IA (Sparkles do `AssistantFab`). O buscador deve pesquisar em todo o sistema, incluindo o conteúdo dos e-mails (assunto, remetente e texto).

## O que muda

### 1. Botão de lupa no cabeçalho (`src/components/AppShell.tsx`)
- Adicionar um botão com ícone `Search` imediatamente à esquerda do `<AssistantFab />` na `<header>`.
- Atalho de teclado: `Ctrl/Cmd + K` abre o mesmo diálogo.
- Visível em todas as telas (já que o header é global).

### 2. Novo componente `GlobalSearchDialog` (`src/components/GlobalSearch.tsx`)
- Diálogo de busca estilo "command palette" usando o `Command` (cmdk) já presente em `src/components/ui/command.tsx`.
- Campo único de texto com debounce de ~250 ms.
- Resultados agrupados por categoria, cada item navega para a página correspondente:
  - **Leads** → `/leads/$leadId` (busca em `leads.name`, `leads.email`, `leads.phone`, `leads.code`, `leads.destination`, `leads.notes`)
  - **Clientes** → `/customers` (busca em `customers.name`, `customers.email`, `customers.phone`, `customers.code`)
  - **Fornecedores** → `/suppliers` (busca em `suppliers.name`, `suppliers.email`, `suppliers.code`)
  - **Reservas** → `/bookings_/$bookingId` (busca em `bookings.code`, `bookings.title`/destino quando existir)
  - **E-mails** → `/email` com o assunto pré-selecionado (busca em `emails.subject`, `emails.from_name`, `emails.from_email`, `emails.snippet`, `emails.body_text`)
- Cada grupo limita a 5 resultados, com indicador "ver mais" quando há mais.
- Estado vazio: mensagem "Digite para buscar em leads, clientes, fornecedores, reservas e e-mails".
- Estado sem resultados: "Nada encontrado para «termo»".

### 3. Busca server-side (`src/server/search.functions.ts`, novo)
- Server function `globalSearch({ q: string })` que dispara em paralelo consultas Supabase com `ilike` (case-insensitive) nas colunas listadas acima.
- Respeita as RLS já existentes — cada tabela retorna apenas o que o usuário pode ver.
- Para e-mails, busca em `subject`, `from_name`, `from_email`, `snippet` e `body_text` (este último com `ilike '%q%'`; se vazio, ainda assim os outros campos cobrem).
- Retorna `{ leads: [...], customers: [...], suppliers: [...], bookings: [...], emails: [...] }`, cada item com `id`, `label`, `subtitle` e qualquer chave necessária para navegação.

### 4. Navegação ao clicar em e-mail
- Ao selecionar um e-mail nos resultados, navegar para `/email?gmail_id=<id>` (ou `email_id` quando for registro local).
- Pequeno ajuste em `src/components/email/EmailPanel.tsx` para ler esse query param ao montar e abrir o thread/mensagem correspondente. Mantém o buscador interno da aba de e-mail intacto.

## Detalhes técnicos

```text
AppShell header
 ├── [Search button] ← novo
 ├── AssistantFab (Sparkles)
 ├── NotificationBell
 ├── Lang select
 └── Currency select
```

- O `Command`/`CommandDialog` do cmdk já cuida de teclado, foco e acessibilidade.
- Debounce com `setTimeout` simples dentro do componente; cancelar em cleanup.
- Server function chamada via `useServerFn` + `useQuery` (`@tanstack/react-query`) para cache automático.
- Limite por consulta: 5 linhas/tabela para manter latência baixa.

## Fora do escopo

- Não altera o buscador local da aba de e-mail (continua filtrando a lista aberta).
- Não cria índices de full-text search (FTS) — fica como evolução futura se a performance pedir.
- Não toca em RLS existente.
