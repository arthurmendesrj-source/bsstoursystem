## Objetivo

Na tela `/bookings/:id`, para cada item:

1. Mostrar todas as informações da proposta (cidade, categoria, datas, check-in/out, diárias, quartos, plano de refeição, pax, trechos, tipo de guia, observações).
2. **Permitir editar inline** todos esses campos.
3. **Permitir adicionar e remover itens** direto na reserva.
4. **Refletir as alterações no voucher** já gerado (campos editáveis e visualização).

Como a reserva usa `quote_items` (via `booking.quote_id`), adicionar/editar/remover itens aqui altera a mesma cotação.

## Mudanças

### 1. `src/routes/bookings_.$bookingId.tsx`

- Ampliar o `select` de `quote_items` para todos os campos:
  ```ts
  .select("id,description,quantity,unit_price,total,kind,city,category,item_date,check_out,nights,rooms,meal_plan,pax,ways,guide_type,notes")
  ```
- Atualizar o tipo `QuoteItem` com esses campos opcionais.
- **Edição inline** (mesma lógica já usada para `confs`):
  - `persistItem(itemId, patch)` → `supabase.from("quote_items").update(patch).eq("id", itemId)`.
  - Salva em `onBlur`/`onValueChange`; estado otimista.
  - Recalcula `nights = diffNights(item_date, check_out)` para hotel quando datas mudam.
  - Recalcula `total = quantity * unit_price` quando quantidade ou preço mudam.
- **Adicionar item**:
  - Botão "Adicionar item" no topo da lista, com `Select` de `kind` (`hotel`, `service`, `transfer`, `tour`, `outro`).
  - `addItem(kind)` → `supabase.from("quote_items").insert({ quote_id: booking.quote_id, kind, description: "", quantity: 1, unit_price: 0, total: 0 })`.
  - Bloqueado quando a reserva não tem `quote_id`.
- **Remover item**:
  - Ícone "lixeira" no card com `confirm()` de segurança.
  - `removeItem(id)`:
    - Apaga voucher do item (`vouchers` por `quote_item_id`) e `booking_item_confirmations` correspondentes — limpeza explícita para evitar lixo.
    - `supabase.from("quote_items").delete().eq("id", id)`.
    - Recarrega a lista.
- **Layout do card**: substituir o subtítulo simples por uma grade `grid-cols-2 md:grid-cols-4 gap-3` com campos condicionais ao `kind`:
  - **Hotel**: `city`, `category`, `item_date` (Check-in), `check_out` (Check-out), `nights`, `rooms`, `meal_plan`, `pax`, `quantity`, `unit_price`.
  - **Serviço/Transfer/Tour**: `city`, `category`, `item_date`, `pax`, `ways`, `guide_type`, `quantity`, `unit_price`.
  - **Outro**: `city`, `category`, `item_date`, `pax`, `quantity`, `unit_price`.
  - `notes`: Textarea 2 linhas.
  - Linha de total (somente leitura): `quantity × unit_price = total`.
- Permissão: respeitar `has_module_permission('bookings','edit')` para edição/adição/remoção; campos ficam `disabled` caso contrário.

### 2. `src/components/booking/VoucherDialog.tsx`

- **Visualização**: incluir os mesmos campos da proposta vinculada ao item (`quote_items`) — check-in/out, diárias, quartos, plano, pax, ways, tipo de guia, cidade, categoria, observações — junto aos campos próprios do voucher (`meeting_point`, `meeting_time`, `service_date`, `customer_instructions`).
- **Modo edição**: continuar editando os campos próprios do voucher; mostrar os campos do item como **somente leitura** com link "Editar na reserva" (fecha o diálogo). Mantém a verdade única no `quote_items`.
- **Reflexo automático**: a query do diálogo já recarrega o item ao abrir, então edições feitas na reserva aparecem imediatamente na próxima abertura.

### 3. `src/lib/i18n.tsx`

- Adicionar pt/en/es: `checkIn`, `checkOut`, `nights`, `rooms`, `mealPlan`, `pax`, `ways`, `guideType`, `category`, `city`, `itemDate`, `unitPrice`, `addItem`, `removeItem`, `removeItemConfirm`, `selectKind`, `editInBooking`. Reaproveitar `quantity`, `notes`, `total`, `description`, `saved`.

## Fora de escopo

- Mudanças de schema (todos os campos já existem em `quote_items`).
- Edição em massa / drag-and-drop de itens.
- Histórico de alterações de itens (continua via `activity_log` se já estiver configurado para `quote_items`).

## Validação

- Editar `check_out` num hotel atualiza `nights` e persiste.
- Editar `quantity`/`unit_price` recalcula `total`.
- Selecionar `meal_plan`/`guide_type`/`category` salva.
- Adicionar item novo aparece no card e na cotação vinculada.
- Remover item: voucher e confirmação correspondentes desaparecem; cotação reflete a remoção.
- Abrir voucher de um item editado mostra os novos valores.
- Usuário sem permissão `bookings.edit` vê tudo em modo leitura, sem botões de adicionar/remover.