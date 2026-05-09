## Objetivo
Padronizar a comunicação do "Sistema de Reserva" nas duas janelas: a do Atendimento (`/workspace`) e a da barra de ferramentas (`/bookings`), exibindo sempre **Cliente** e **Nº de Invoice** (de `invoices.number` vinculada por `booking_id`).

## 1. Janela do Atendimento (`src/routes/workspace.tsx`)

Carregar invoices junto das reservas e expandir os cards.

- Em `loadLead()` (≈ linha 148), adicionar busca paralela:
  - `supabase.from("invoices").select("id,number,booking_id,status,total").in("booking_id", bookingIds)` após carregar `bookingsRes`.
  - `supabase.from("booking_pax").select("id,booking_id,is_primary,customer_id, customers(full_name)").in("booking_id", bookingIds)`.
  - `supabase.from("booking_suppliers").select("id,booking_id,service_type,status,cost,currency, suppliers(name)").in("booking_id", bookingIds)`.
- Estender o tipo `Booking` para incluir `customer_id`, e novos states `bookingInvoices`, `bookingPax`, `bookingSuppliers` (mapas por `booking_id`).
- No accordion **Reservation** (linhas 620-650) e na janela flutuante `openSection("reservation")` (linhas 264-283):
  - Cabeçalho do card: `Cliente: <nome do customer principal> · Invoice: <invoices.number ou "—">`.
  - Subseção colapsável "Itens da reserva" listando:
    - Passageiros (booking_pax.customers.full_name + tag "principal").
    - Serviços/fornecedores (booking_suppliers.service_type · supplier.name · status · custo).
  - Manter datas, status e total.
- `openBookingWindow(b)` (linhas 294-320): trocar título para `Reserva ${invoiceNumber ?? "—"} · ${customerName}` e adicionar as duas seções (passageiros e serviços) no corpo.

## 2. Janela da barra de ferramentas (`src/routes/bookings.tsx`)

Adicionar coluna **Invoice** como primeira da tabela e garantir que sempre venha preenchida (com aviso quando faltar).

- Carregar invoices junto na função `load()` (linha 62):
  - `supabase.from("invoices").select("id,number,booking_id").in("booking_id", bookingIds)` e mapear `invoice_number` em cada `Booking`.
- Estender tipo `Booking` com `invoice_number?: string | null`.
- `<TableHeader>` (linhas 201-211): inserir `<TableHead>Invoice</TableHead>` ANTES de `Cliente`.
- `<TableBody>` (linha 217): nova primeira célula com `b.invoice_number` em badge `font-mono`; quando ausente, mostrar badge âmbar `"sem invoice"` + tooltip "Gere uma invoice para esta reserva".
- Ajustar `colSpan={7}` → `colSpan={8}` no estado vazio.
- Diálogo "Nova reserva" (linhas 149-195):
  - Marcar **Cliente** com `*` e adicionar texto auxiliar "Cliente e nº de invoice devem ser preenchidos. A invoice pode ser gerada após salvar a reserva.".
  - Após `INSERT bookings` bem-sucedido (linha 92-99), exibir toast extra: "Reserva criada — gere a invoice para concluir." quando `customer_id` presente mas sem invoice ainda. Não bloquear o fluxo.
- `Link "Abrir reserva"` continua igual; cabeçalho da página `/bookings/$bookingId` fica fora do escopo desta iteração.

## 3. i18n (`src/lib/i18n.tsx`)

Adicionar chaves em pt/en/es: `invoiceNumber` ("Invoice"/"Invoice"/"Factura"), `noInvoiceForBooking` ("Sem invoice — gere uma invoice para esta reserva."), `bookingItems` ("Itens da reserva"/"Booking items"/"Items de la reserva"), `passengers` ("Passageiros"/"Passengers"/"Pasajeros"), `services` ("Serviços"/"Services"/"Servicios").

## Fora de escopo
- Geração automática de invoice no insert de reserva (usuário escolheu "não bloquear, só exibir aviso").
- Mudança nas RLS / migrations (todas as tabelas necessárias já existem com RLS).
- Edição da rota `bookings_.$bookingId.tsx`.
