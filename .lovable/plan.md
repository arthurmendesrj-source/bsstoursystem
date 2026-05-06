## Objetivo

No botão **Adicionar hotel** da aba "Proposta em atendimento", abrir um popup `HotelDialog` no mesmo padrão do `ServiceDialog`, com layout conforme a imagem. Permitir texto livre nos campos com autocomplete (Cidade e Hotel), sobrepondo as sugestões, e cadastrar automaticamente em `ref_cities`/`ref_services` quando o valor digitado ainda não existir.

## Layout do popup (conforme imagem)

Dialog `max-w-md`, uma coluna, campos na ordem:

- **Em*** (check-in) — date picker (Popover + Calendar)
- **Fora*** (check-out) — date picker
- **Cidade** — `ComboboxAutocomplete` sobre `ref_cities` (allowCustom)
- **Hotel*** — `ComboboxAutocomplete` sobre `ref_services` (allowCustom)
- **Sala*** (Room/Quarto) — Input texto (ex.: "Standard", "Deluxe")
- **Tipo** (Meal plan) — Select: Room only, Breakfast, Half board, Full board, All inclusive
- **Avaliar** (Categoria/estrelas) — Select: 3★, 4★, 5★, Boutique, Other
- **Quantidade*** — number (nº de quartos), default 1
- **Total** — number
- **Notas** — Textarea

Footer com **Cancelar** / **Salvar**.

Validações: check-in, check-out, hotel, sala e quantidade obrigatórios; check-out ≥ check-in.

## Comportamento de salvamento

Insert/update em `quote_items` com `kind="hotel"`:
- `description` = nome do hotel
- `city`, `category` (Avaliar), `meal_plan` (Tipo)
- `rooms` = quantidade
- `item_date` = check-in, `check_out` = check-out
- `nights` = `diffNights(check_in, check_out)`, `quantity` = `nights`
- `unit_cost` = `total / max(nights,1)`, `unit_price` = `unit_cost`, `markup_pct` = `defaultMarkupPct`
- `total` = total digitado
- `notes` = "Sala: <sala>" + (se houver) "\n" + notas
  - Como `quote_items` não tem coluna específica de "sala", preservamos o valor dentro de `notes` para não exigir migração.

## Auto-cadastro de referências

Mesma lógica do ServiceDialog:
- `ensureRefCity(city)` → `upsert ref_cities {name, slug}`, `onConflict: "slug", ignoreDuplicates: true`
- `ensureRefHotel(hotel)` → `upsert ref_services {name, slug, category_id}`, `onConflict: "slug", ignoreDuplicates: true`
  - `category_id` resolvido por `ref_service_categories` onde `kind='hotel'` e `slug='hotel'`; se não existir, fica `null`.
- Comparação normalizada (sem acentos, lowercase, pontuação/espaços colapsados) contra as opções carregadas para evitar duplicados.
- Toast `Novo hotel cadastrado: …` / `Nova cidade cadastrada: …` quando inéditos.

## Edição/exclusão na tabela de hotéis

- Adicionar botões **Pencil** (editar) e **Trash2** (excluir com `confirm`) na linha de hotel da `ItemTable`, espelhando o que já existe para serviço.
- `openEditHotel(id)` carrega o item por id e abre o dialog com `initial`. O campo "Sala" é extraído do `notes` se prefixado por `"Sala: "`.

## Arquivos afetados

- `src/components/proposal/HotelDialog.tsx` (criar)
- `src/components/proposal/ProposalEditor.tsx` (editar):
  - importar `HotelDialog` e `HotelInitial`
  - estados `hotelDialogOpen`, `editingHotel`
  - trocar `addItem("hotel")` no botão para abrir o dialog
  - passar `onEdit` e `onRemove` (com confirm) na `ItemTable` de hotéis

Sem migrações de banco — todas as colunas necessárias já existem em `quote_items`.
