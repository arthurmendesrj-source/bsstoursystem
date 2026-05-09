## Mover botões "Adicionar hotel" e "Adicionar serviço" para o cabeçalho das caixas

Padronizar com a caixa de Voos: cada seção (Hotéis, Serviços, Voos) tem o botão "Adicionar" no próprio cabeçalho da caixa. Remover esses botões da barra de tarefas superior.

### `src/components/proposal/ProposalEditor.tsx`

1. **Barra superior (linhas 565–578)**: remover os três botões `addHotel`, `addService` e `Adicionar voo`. Manter Ditar, Assistente IA, Gerar Documento, Salvar e ações de fluxo.

2. **`ItemTable`**: passar a renderizar sempre uma caixa com cabeçalho no mesmo estilo da caixa de Voos (`rounded-md border` + header `flex items-center justify-between px-3 py-2 border-b bg-muted/30`).
   - Adicionar props: `onAdd?: () => void`, `addLabel?: string`, `icon?: ReactNode`.
   - Header mostra ícone + título à esquerda e botão `Adicionar` (variant outline, `Plus`) à direita quando `onAdd` e não `readOnly`.
   - Estado vazio: substituir o bloco "noData" por uma linha simples dentro da caixa (`p-3 text-sm text-muted-foreground`), igual à caixa de Voos quando não há voo.
   - Tabela atual permanece quando há linhas, dentro da mesma caixa.

3. **Chamadas a `ItemTable`** (Hotéis e Serviços) passam:
   - `onAdd={() => { setEditingHotel(null); setHotelDialogOpen(true); }}` + `addLabel={t("addHotel")}` + ícone `Hotel`.
   - `onAdd={() => { setEditingService(null); setServiceDialogOpen(true); }}` + `addLabel={t("addService")}` + ícone `Wrench`.
   - Envolver com `<Can module="quotes" action="edit">` apenas o `onAdd` (passar `undefined` quando o usuário não tem permissão) — solução simples: calcular `const canEditQuotes = ...` via hook `usePermissions` já presente, ou derivar de `!readOnly && canEdit` que já existe no escopo.

4. Caixa de Voos permanece como está (já é o modelo de referência).

### Validação
1. Abrir proposta em `/workspace?lead=...` → barra superior só mostra Ditar, Assistente IA, Gerar Documento, Salvar (e ações de fluxo).
2. Caixas Hotéis e Serviços exibem cabeçalho com botão "Adicionar hotel"/"Adicionar serviço" à direita, idêntico à caixa de Voos.
3. Clicar nos botões abre os respectivos diálogos.
4. Sem permissão de edição: botões "Adicionar" não aparecem nos cabeçalhos.
5. Quando vazio: caixa segue visível com mensagem "Nenhum item" e o botão Adicionar no cabeçalho.
