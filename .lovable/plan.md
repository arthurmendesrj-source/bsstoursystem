## Objetivo

Nos diálogos de **Hotel**, **Voo** e **Serviço** dentro da Proposta, todo campo deve permitir digitar livremente E sugerir valores existentes (autocomplete + entrada livre).

## Mudanças

### 1. Hotel (`HotelDialog.tsx`)
Converter para `ComboboxAutocomplete` com `allowCustom`:
- **Sala** (hoje só Input livre) → autocompleta com tipos de sala já usados em outras propostas (distinct de `quote_items.notes` parseando `Sala: ...` ou nova tabela `ref_room_types`).
- **Tipo (meal plan)** (hoje Select fixo) → combobox com lista padrão + valores já usados, aceitando texto livre.
- **Avaliar (categoria)** (hoje Select fixo) → idem, combobox com 3★/4★/5★/Boutique + custom.

### 2. Serviço (`ServiceDialog.tsx`)
- **Tipo de guia** (hoje Select fixo) → combobox com lista padrão + qualquer texto custom.

### 3. Voo (`FlightDialog.tsx`)
Hoje todos os campos são Inputs sem sugestão. Trocar para `ComboboxAutocomplete` carregando histórico distinto de `quote_flights`:
- **Número do voo** → distinct `flight_number`.
- **De / Para** (códigos IATA) → distinct `from_code` / `to_code`, sempre uppercase, aceita custom.
- Data, partida, chegada, pax, total e notas continuam como inputs nativos (já são editáveis).

### 4. Persistência de novos valores
Sempre que o usuário digitar algo novo:
- Cidade/Hotel/Serviço continuam usando `ref_cities` / `ref_services` (já existe).
- Sala, meal plan, categoria, tipo de guia, número de voo e códigos de aeroporto: ficam apenas no `quote_items`/`quote_flights` (próximas buscas pegam pelo distinct, sem nova tabela).

## Fora de escopo
- Novas tabelas `ref_*` para meal_plan, categorias, salas, aeroportos.
- Mudança de schema ou RLS.
- Edição inline na lista da proposta (mantém-se via diálogo).