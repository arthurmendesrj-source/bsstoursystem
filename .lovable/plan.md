## Popup "Adicionar serviço" na Proposta

Trocar o comportamento atual do botão **Adicionar serviço** (que hoje insere uma linha vazia direto na tabela) por um popup com o layout da imagem.

### Campos do popup

- **Data*** — date picker (formato dd-mm-yyyy)
- **Cidade** — combobox (autocomplete sobre `ref_cities`, permite digitar livre)
- **Serviço** — combobox (autocomplete sobre `ref_services` filtrando por tipo "service", permite entrada livre)
- **Tipo de guia** — select com opções: English Guide, Portuguese Guide, Spanish Guide, French Guide, German Guide, Russian Guide, Italian Guide, Other (limpável com "x")
- **Pax*** — número (mínimo 1)
- **Total** — número (opcional)
- **Notas** — textarea

Botões **Cancelar** / **Salvar**. Validação: Data e Pax obrigatórios (mostra "Obrigatório" em vermelho).

### Onde os dados são salvos

Continuam em `quote_items` (kind = `service`), aproveitando o que já existe:

- `description` ← Serviço
- `city` ← Cidade
- `item_date` ← Data
- `pax` (e `quantity` = pax) ← Pax
- `unit_cost` / `unit_price` / `total` ← Total (quando informado, dividido pelo pax para preencher unit_price)
- guia e notas → adicionar 1 coluna nova `guide_type` e reaproveitar `category` se necessário; **notas do item** ficam em uma nova coluna `notes` em `quote_items`.

### Banco

Migração para adicionar em `quote_items`:
- `guide_type text` (nullable)
- `notes text` (nullable)

### Frontend

1. **Novo componente** `src/components/proposal/ServiceDialog.tsx` com o formulário acima.
2. **`ProposalEditor.tsx`**:
   - Botão **Adicionar serviço** passa a abrir `ServiceDialog` (em vez de chamar `addItem("service")`).
   - Ao salvar: insere em `quote_items` com `kind="service"` e recarrega lista.
   - Tabela de serviços passa a mostrar o item recém-criado normalmente (edição inline já existente continua funcionando).
3. Reutiliza `ComboboxAutocomplete` (já presente) para Cidade e Serviço.

### Fora do escopo

- Cadastro/gestão de tipos de guia em tabela própria (lista fixa por enquanto).
- Edição via popup (somente criação; edição segue inline na tabela como hoje).