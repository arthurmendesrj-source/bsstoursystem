
# Proposta como janela flutuante (min/max/restaurar)

Hoje, ao clicar uma vez numa proposta/invoice em `/workspace`, ela abre num `Dialog` modal (sem controles de janela). O duplo-clique já abre em janela flutuante. O usuário quer que **toda abertura** da proposta tenha minimizar/maximizar/restaurar.

## Mudança

Em `src/routes/workspace.tsx`, dentro de `ProposalsTab`:

1. Remover o `Dialog`/`DialogContent` que envolve `<ProposalEditor>`.
2. Remover o estado `openId` (não é mais necessário).
3. No `onClick` da linha da proposta, chamar a mesma função `openInWindow(q)` que hoje é usada no `onDoubleClick`.
4. Remover o `onDoubleClick` específico (vira redundante) — manter apenas `onClick` abrindo a janela.
5. Aumentar o `defaultSize` padrão da janela de proposta para `{ width: 1200, height: 760 }` (mais perto do antigo `max-w-5xl max-h-[90vh]` do dialog) e manter `sizeKey: mode` para lembrar tamanho por tipo (proposal/invoice separados).

Resultado: clicar numa proposta abre direto a janela flutuante com `ProposalEditor` dentro, com header padrão (minimizar, maximizar, restaurar, fechar) — igual ao e-mail e às demais janelas do workspace. O `onSaved` continua atualizando a lista; `onClose` fecha a janela via `win.closeWindow`.

## Validação

1. Abrir `/workspace?lead=...`, expandir Propostas, clicar 1x numa proposta → abre janela flutuante (não modal).
2. Botões da barra de título: minimizar manda para a barra inferior; maximizar ocupa viewport; restaurar volta ao tamanho anterior; fechar encerra.
3. Salvar item dentro da proposta atualiza a lista da aba sem fechar a janela.
4. Mesmo comportamento para o modo `invoice`.
