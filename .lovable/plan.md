## Objetivo

Permitir selecionar várias atividades (ou todas as filtradas) na página `/activities` e executar ações em lote.

## Mudanças em `src/routes/activities.tsx`

1. **Estado de seleção**
   - Adicionar `selectedIds: Set<string>` no componente.
   - Limpar seleção ao recarregar dados ou mudar filtros.

2. **Coluna de checkbox na tabela**
   - Nova `<TableHead>` no início com um `Checkbox` master (selecionar/desmarcar todas as filtradas).
   - Estado intermediário (indeterminate) quando algumas selecionadas.
   - Cada `<TableRow>` ganha um `Checkbox` para selecionar individualmente.
   - Usar componente `@/components/ui/checkbox` (já disponível).

3. **Barra de ações em lote**
   - Aparece acima da tabela quando `selectedIds.size > 0`.
   - Mostra contador: "N atividades selecionadas".
   - Botões de ação:
     - **Concluir** — marca `completed=true` em todas selecionadas.
     - **Reabrir** — marca `completed=false`.
     - **Iniciar/Pausar** — define `started_at`.
     - **Excluir** — confirmação e delete em massa.
     - **Limpar seleção**.

4. **Implementação das ações em lote**
   - Usar `supabase.from("tasks").update({...}).in("id", [...])` ou `.delete().in("id", [...])`.
   - Toast de sucesso/erro, recarregar `loadData()` e limpar seleção.
   - Confirmação `confirm()` antes de excluir em lote.

5. **i18n**
   - Adicionar chaves em `src/lib/i18n.tsx` (pt/en/es): `selectAll`, `selectedCount`, `bulkComplete`, `bulkReopen`, `bulkDelete`, `clearSelection`, `confirmBulkDelete`.

## Detalhes técnicos

- O master checkbox seleciona apenas as linhas atualmente em `filtered` (respeita filtros aplicados).
- Estado `indeterminate` calculado: `selected > 0 && selected < filtered.length`.
- Operações em lote feitas em uma única requisição usando `.in("id", ids)` para performance.
- Manter UX consistente: linhas selecionadas com leve destaque (`bg-muted/50`).
