## Box "Fornecedor" por item na tela de confirmação da reserva

Adicionar um campo **Fornecedor** em cada card de item da rota `/bookings/$bookingId`, com combobox (lista de fornecedores cadastrados) + texto livre, persistindo na confirmação do item.

### Mudanças

**1. Banco** (`booking_item_confirmations`)
- Adicionar 2 colunas:
  - `supplier_id uuid null` (FK lógica para `suppliers.id`)
  - `supplier_name text null` (fallback texto livre, usado quando não há `supplier_id`)
- Index em `supplier_id`.

**2. UI** — `src/routes/bookings_.$bookingId.tsx`
- No card de cada item, adicionar um bloco "Fornecedor" antes do bloco de proof (linha ~490), ocupando largura cheia:
  - `ComboboxAutocomplete` carregado com `suppliers (id, name)` (fetch único no `load`).
  - Permitir digitar valor novo → grava em `supplier_name` (e zera `supplier_id`).
  - Selecionar item da lista → grava `supplier_id` + `supplier_name` (espelhado para exibição).
- Estender `Confirmation` type com `supplier_id`/`supplier_name`.
- `persist()` passa a incluir os 2 campos no upsert.
- Visual: card com `Label` "Fornecedor" + combobox; sem botão extra.

### Fora do escopo
- Não usar `booking_suppliers` (é por reserva, não por item).
- Não tocar em `quote_items`.
- Sem cadastro inline de fornecedor novo (texto livre cobre o caso).
