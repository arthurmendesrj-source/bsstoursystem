## Mudanças em `/activities`

### 1. Ação "Vincular a Lead" (individual + em lote)

**Estado novo:**
- `linkDialogOpen: boolean`, `linkTargetIds: string[]` (1 ou N), `linkLeadId: string`
- Reaproveitar `leadOptions` já carregado para o dialog de criação (carregar também ao abrir o dialog de vincular).

**UI:**
- Botão `Vincular a Lead` (ícone `Link2`) na barra de ações em lote (aparece quando `selectedIds.size > 0`).
- Botão pequeno `Link2` na coluna Ações de cada linha → abre o mesmo dialog com `linkTargetIds=[task.id]`.
- Dialog com `<Select>` listando leads (`code · name`), opção "—" para desvincular, botão Salvar.

**Ação:**
- `linkToLead()`: `supabase.from("tasks").update({ lead_id: linkLeadId || null, category: linkLeadId ? "negocio" : "suporte" }).in("id", linkTargetIds)`, depois `toast`, fecha dialog, `clearSelection()`, `loadData()`.

**i18n** (pt/en/es): `linkToLead`, `unlink`.

### 2. Mover botão de check (concluir) para o final da linha

- Remover a `<TableCell>` do botão round-check que está logo após a coluna de seleção (atual posição 2).
- Remover a `<TableHead>` vazia correspondente no header.
- Adicionar o mesmo botão dentro da `<TableCell>` de Ações (final, antes/junto a Iniciar/Pausar/Vincular/Excluir).

### Resultado

Layout final das colunas: `[checkbox seleção] · Título · Lead · Categoria · Prioridade · Vencimento · Tempo · Ações(check, iniciar/pausar, vincular, excluir)`.