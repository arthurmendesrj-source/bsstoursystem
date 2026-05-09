
# Leitura de e-mail no Atendimento: 1 clique inline + duplo-clique flutuante

Hoje em `/workspace`, o `EmailPanel` mostra apenas a lista de threads (largura `max-w-[560px]`) e o clique abre uma janela flutuante via `ThreadWindowManager`. Não há painel de leitura inline.

## Mudanças

### 1. `src/components/email/EmailPanel.tsx`
- Adicionar nova prop `inlineReader?: boolean` (default `false` — não muda outras telas).
- Quando `inlineReader` for `true`:
  - Trocar comportamento do `onOpenThread` da `ThreadListSection`: em vez de chamar `windowsRef.openOrFocus`, apenas atualiza `selectedThreadId` (e marca como lido).
  - Adicionar handler `onDoubleClick` na linha da thread → chama `windowsRef.current?.openOrFocus(...)` (comportamento atual).
  - Renderizar um painel à direita da `ThreadList` quando há `selectedThreadId`: usa o componente `ThreadReader` já existente (`src/components/email/ThreadReader.tsx`), passando `fetchMessages`, `onReply`, `onForward`, `onStar`, `onArchive`, `onTrash`, `onDownloadAttachment` (mesmas funções já usadas pelo `ThreadWindowManager`).
  - Layout: remover o `max-w-[560px]` da lista quando inline, e usar `flex` com lista (`w-[380px] shrink-0 border-r`) + reader (`flex-1 min-w-0`).
  - Botão "abrir em janela" no header do reader inline (ícone `Maximize2`) que chama `openOrFocus` e limpa `selectedThreadId`.

### 2. `src/routes/workspace.tsx`
- Passar `inlineReader` ao `EmailPanel` quando renderizado dentro da aba/seção de Atendimento (linha ~562 e na função `openSection("email")`).

### 3. `ThreadListSection`
- Aceitar prop opcional `onDoubleClickThread` e ligar no `onDoubleClick` do botão da thread (somente quando passado).

## Validação
1. `/workspace?lead=...` → expandir Email: lista à esquerda, área vazia "Selecione uma conversa" à direita.
2. 1 clique numa thread → conteúdo aparece inline à direita; thread fica destacada e marcada como lida.
3. Duplo-clique numa thread → abre a janela flutuante (com min/max/restaurar) como hoje.
4. Botão maximizar no header do reader inline → abre a mesma thread em janela flutuante.
5. Página `/email` (que usa `EmailPanel` sem `inlineReader`) continua igual: clique único abre janela flutuante.
