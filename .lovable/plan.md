## Objetivo

Remover o uso das tabelas `ref_cities` e `ref_services` como fonte do autocomplete nos diálogos de **Hotel** e **Serviço** da Proposta. O autocomplete continua, porém alimentado **apenas pelo histórico do que já foi digitado** em propostas anteriores (`quote_items`). Tudo continua editável e aceitando texto livre.

## Mudanças

### 1. `HotelDialog.tsx`
- **Remover** as queries a `ref_cities` e `ref_services` no `useEffect`.
- **Remover** as funções `ensureRefCity` e `ensureRefHotel` (e a chamada delas no `save`).
- **Carregar opções a partir de `quote_items`** (kind = `hotel`):
  - **Cidade** → distinct de `quote_items.city`.
  - **Hotel** → distinct de `quote_items.description`.
  - **Sala** → distinct extraído de `quote_items.notes` (regex `^Sala:\s*(...)`), como já é hoje.
  - **Tipo (meal plan)** → opções fixas `MEAL_PLANS` + distinct de `quote_items.meal_plan` para incluir o que o usuário já digitou custom.
  - **Avaliar (categoria)** → opções fixas `CATEGORIES` + distinct de `quote_items.category`.
- O `save` apenas grava em `quote_items` (sem upsert em tabelas `ref_*`). Próximas aberturas pegam o valor novo via distinct.

### 2. `ServiceDialog.tsx`
- **Remover** as queries a `ref_cities` e `ref_services` no `useEffect`.
- **Remover** `ensureRefCity` e `ensureRefService` (e a chamada no `save`).
- **Carregar opções a partir de `quote_items`** (kind = `service`):
  - **Cidade** → distinct de `quote_items.city`.
  - **Serviço** → distinct de `quote_items.description`.
  - **Tipo de guia** → opções fixas `GUIDE_TYPES` + distinct de `quote_items.guide_type` (inclui qualquer texto custom anteriormente salvo).
- `save` continua gravando apenas em `quote_items`.

### 3. Comportamento
- Autocomplete: digita → sugere a partir do histórico; sempre pode salvar texto livre (`allowCustom`).
- Ao salvar uma nova proposta, o novo valor passa a aparecer automaticamente nas próximas sugestões (próxima query distinct).
- Nenhuma escrita em `ref_cities` / `ref_services` é feita por estes diálogos.

## Fora de escopo
- Apagar/dropar tabelas `ref_cities` ou `ref_services` (continuam existindo; apenas não são usadas por estes dois diálogos).
- Mudar `FlightDialog` (já usa distinct de `quote_flights`).
- Outros lugares do app que ainda consomem `ref_cities` / `ref_services`.
