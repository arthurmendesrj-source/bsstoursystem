## Objetivo

1. **Criar invoice automaticamente** quando uma cotação (quote) é convertida em reserva, para que o número da invoice apareça na coluna "Invoice" sem ação extra.
2. **Padronizar a janela de Reserva no Atendimento** com o mesmo layout/tabela da janela da barra de ferramentas (`/bookings`), mostrando colunas: Invoice · Cliente · Pacote/Datas · Valor · Status · Voucher.

---

## 1. Conversão de cotação → reserva já cria a invoice

Hoje `bookings.tsx` e `workspace.tsx` buscam `invoices.number` por `booking_id`, mas a conversão da cotação não insere nenhum registro em `invoices` — por isso aparece sempre "sem invoice". O número visual `IN<leadCode>` existe só dentro do `ProposalEditor`.

**Arquivos a alterar (frontend, sem migration):**

- `src/components/proposal/ProposalEditor.tsx` (`convertToBooking`, ~linha 488):
  - Após `INSERT bookings` retornar com sucesso, fazer `INSERT public.invoices` com:
    - `number`: `IN${leadCode ?? quote.id.slice(0,8).toUpperCase()}` (mesmo cálculo já usado na UI).
    - `booking_id`: id da reserva recém-criada (usar `.select("id").single()` no insert de bookings).
    - `quote_id`, `customer_id`, `currency`, `subtotal = total = quote.total_amount`, `status: "draft"`, `created_by: uid`, `issued_at: new Date().toISOString()`.
  - Tratar conflito de `number` único: se já existir invoice com mesmo number (refazendo conversão), apenas atualizar `booking_id`.

- `src/components/NotificationBell.tsx` (`convertQuote`, ~linha 108):
  - Mesma lógica: capturar `id` do booking inserido e criar a invoice com número `IN${q.lead_id?.slice(0,8).toUpperCase() ?? q.id.slice(0,8)}` (não temos `leadCode` aqui — buscar `leads.code` antes do insert para manter padrão `IN<leadCode>`).

- Sem mudança de schema/RLS (a tabela `invoices` já tem RLS para `bookings.create/edit`).

---

## 2. Janela de Reserva do Atendimento = tabela do `/bookings`

Hoje o Atendimento renderiza cards (`renderBookingCard`). Vamos substituir pela mesma tabela do `/bookings`, mantendo as queries/estados que já existem em `workspace.tsx`.

**Arquivo: `src/routes/workspace.tsx`**

- Criar um novo helper `renderBookingsTable(bookings: Booking[])` que renderiza:
  - `<Table>` com `<TableHeader>` idêntico ao de `/bookings`:
    `Invoice | Cliente | Pacote | Saída | Valor | Status | Voucher | Ações`.
  - Linha: badge mono com `invoice_number` ou badge âmbar "sem invoice"; nome do cliente (`b.customer_name` ou primário de `bookingPax`); pacote (já carregado: adicionar `package_id`+nome via mapa `packages` se necessário, ou simplesmente "—" quando não houver — `/bookings` mostra "—"); data de saída; `MaskedField` total; `Select` de status (mesma lista `STATUSES`); badge do voucher (consultar tabela `vouchers` por `booking_id` no `loadLead`); botão "Abrir reserva" → `Link` para `/bookings/$bookingId` (mesmo destino).
  - Estado vazio com `colSpan={8}`.
- Usar essa tabela em **dois lugares**:
  - Accordion "Reservation" (na coluna lateral) — substitui `bookings.map(renderBookingCard)`.
  - Janela flutuante `openSection("reservation")` — substitui o `bookings.map(...)` no `content`.
- Manter `openBookingWindow` para o duplo-clique no item, mas seu conteúdo passa a ser também a tabela filtrada por aquela reserva (uma linha) + lista de passageiros/serviços abaixo.
- Carregar `vouchers` e `packages` no `loadLead` em paralelo, para alimentar as colunas Voucher e Pacote.

---

## i18n

Reaproveitar chaves já existentes (`invoiceNumber`, `customers`, `packages`, `departureDate`, `price`, `status`, `actions`, `noData`, `openBooking`, `generateVoucher`, `noInvoiceForBooking`). Sem novas chaves.

## Fora de escopo

- Geração/edição da invoice criada (continua "draft"); o usuário ajusta depois pela janela de Invoice.
- Migrations / mudanças de RLS.
- Mudanças no `/bookings` toolbar — ele já está como o usuário pediu.
