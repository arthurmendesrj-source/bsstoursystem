

# Aumentar campo de nome do Hotel na Proposta

O input do nome do hotel hoje é estreito demais e corta o texto durante a digitação. Vamos dar mais espaço a ele no editor.

## Mudança

Em `src/components/proposal/ProposalEditor.tsx`, na linha de Hotel:

- Aumentar a largura mínima do input de **Hotel** (campo `description` quando `kind='hotel'`) — passar de `w-40`/`w-48` (atual) para `min-w-[260px] flex-1`, para que ele cresça e mostre nomes longos como "Hotel Copacabana Palace by Belmond".
- Reduzir levemente colunas auxiliares pouco usadas (Category, Meal, City) com `min-w-[110px]` cada, para sobrar espaço.
- Garantir que a linha use `flex-wrap` em telas estreitas (≤1024px) para não espremer demais nenhum campo.
- Mesmo tratamento no modo `invoice` (read-only): o nome do hotel ocupa o espaço flexível restante.

Sem mudanças no banco, sem mudanças em outros arquivos.

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Editar | `src/components/proposal/ProposalEditor.tsx` |

