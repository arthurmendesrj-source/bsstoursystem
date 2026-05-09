
# Email no Atendimento: abrir só com duplo-clique

Reverter o painel inline. Em `/workspace`, o e-mail deve seguir o mesmo padrão dos outros itens (atividade, proposta, invoice, reserva): **duplo-clique abre em janela flutuante** com min/max/restaurar; clique simples apenas seleciona/destaca a linha (sem abrir nada).

## Mudanças

### `src/components/email/EmailPanel.tsx`
- Em modo `inlineReader`:
  - `onOpenThread` (clique simples) passa a apenas atualizar `selectedThreadId` para destacar a linha — **não** abre janela e **não** carrega mensagens.
  - Remover o painel `InlineReaderPane` e o estado/efeito `inlineMessages`/`inlineLoading`.
  - Voltar a lista a ocupar a largura total disponível (`flex-1 min-w-0`, sem `max-w-[560px]`).
  - Manter `onDoubleClickThread={openThreadInWindow}` para abrir a janela flutuante via `ThreadWindowManager`.
- Sem `inlineReader` (página `/email`): comportamento atual segue intacto.

## Validação
1. `/workspace?lead=...` → expandir Email.
2. 1 clique numa thread → linha fica destacada, nada abre.
3. Duplo-clique numa thread → abre a caixa de leitura em janela flutuante (min/max/restaurar/fechar).
4. `/email` continua funcionando como antes (clique abre janela direto).
