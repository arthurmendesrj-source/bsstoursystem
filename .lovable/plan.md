## Mudanças no diálogo Hotel (proposta)

### 1. Banco de dados (migração)
- Adicionar coluna `room_config` (text, nullable) em `quote_items`.

### 2. UI — `src/components/proposal/HotelDialog.tsx`
- Novo campo **Configuração** (seleção única) com opções: Single, Double, Triple, Quadruple — usando `ComboboxAutocomplete` ou `Select`. Posicionado logo após "Sala".
- Renomear label **"Tipo"** → **"Mealplan"**.
- Constante `MEAL_PLANS`: trocar `"Breakfast"` por `"Bed&Breakfast"`.
- Estado `roomConfig`, carregar de `initial?.room_config`, salvar em `payload.room_config`.

### Fora do escopo
- Migração de dados antigos (linhas existentes ficam com `room_config = null`).
- Exibição da configuração nos PDFs/listagens (pode ser feito depois).
