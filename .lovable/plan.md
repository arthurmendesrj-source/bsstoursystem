## Objetivo
Permitir digitar o **Total** direto na linha da tabela de Hotéis, Serviços e Voos da proposta, sem precisar abrir o diálogo de edição.

## Mudanças

### `src/components/proposal/ProposalEditor.tsx` — tabela de Hotéis e Serviços (`ItemTable`)
- Substituir a célula somente-leitura da coluna **Subtotal** (linhas ~1161) por um `<Input type="number" step="0.01">` editável.
- Ao alterar o valor:
  - Hotel: `unit_cost = novoTotal / max(noites, 1)`, atualiza também `unit_price`.
  - Serviço: `unit_cost = novoTotal / max(quantity, 1)`, atualiza `unit_price`.
  - Markup é mantido em 0 nesse caminho para que `subtotal == total digitado` (consistente com o diálogo, que já grava com markup default e usa `total/denominador`).
- Manter `disabled={readOnly}`. Sem novo gate de permissão — segue a regra recém-aprovada de Total sempre editável.
- O cálculo exibido continua via `lineSubtotal`, mas refletirá exatamente o valor digitado.

### `src/components/proposal/ProposalEditor.tsx` — tabela de Voos
- Trocar a célula da coluna **Total** (linha ~892) por um `<Input type="number" step="0.01">`.
- Onchange faz `update` direto em `quote_flights.total` via supabase e atualiza o estado local de `flights`. Debounce simples no blur (salvar `onBlur` + Enter) para não disparar update a cada tecla.
- Sem alterar pax/horários.

## Comportamento
- Usuário clica na célula Total, digita o valor, sai do campo (blur) → salva.
- Diálogo de edição continua disponível para os demais campos.
- Nenhuma mudança em schema, RLS ou permissões.
