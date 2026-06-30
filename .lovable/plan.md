## Objetivo
Remover o item "Inbox IA" do menu lateral e manter apenas "Triagem Email" — criando a rota que hoje está faltando (gera 404).

## Mudanças

### 1. Menu lateral (`src/components/AppShell.tsx`)
- Remover a linha `{ to: "/inbox-ia", label: "Inbox IA", ... }`.
- Manter `{ to: "/inbox-ia/email", label: "Triagem Email", ... }`.
- Remover o mapeamento `"/inbox-ia": "inbox-ia"` (manter o `/inbox-ia/email`).

### 2. Criar a rota faltante `src/routes/inbox-ia_.email.tsx`
Tela dedicada de triagem (hoje não existe — por isso fica em branco):
- Reaproveita o componente `EmailMailbox` já existente, que possui o botão "Triagem IA" e roda análise em lote dos não lidos.
- Filtros pré-aplicados: pasta `INBOX` + apenas **não lidos** + período (Hoje / 7d / 30d / 90d) + seleção de conta de email.
- Cabeçalho com título "Triagem Email" e botão "Triagem IA em lote" (já existente no mailbox).
- Resultados de triagem persistem em `email_ai_cache` (já implementado).

### 3. Limpeza
- Remover referências a `inbox-ia` (sem `/email`) em `src/routes/workspace.tsx` (linha 1137) e `AppShell.tsx` (linha 73).
- Manter o toast em `ProposalEditor.tsx` ("Ação enfileirada no Inbox IA") — trocar texto para "Ação enfileirada na Triagem Email".

## Resultado
- Menu lateral mostra apenas **Triagem Email**.
- Clicar abre tela funcional de triagem em lote dos e-mails não lidos, com IA persistida.
- Nada da funcionalidade de IA do mailbox normal é alterado.
