## Página de Reserva: confirmação item-a-item com comprovante

Hoje a `/bookings` é só uma lista plana. A reserva tem `quote_id` ligado à proposta, e a proposta tem `quote_items`. Vamos criar uma **tela de detalhe da reserva** que lista todos os itens da proposta e permite confirmar cada um anexando um comprovante (E-mail, Mensagem WhatsApp ou Outro).

### 1. Banco de dados (migração)

Nova tabela `booking_item_confirmations`:

- `id` uuid pk
- `booking_id` uuid (referência lógica a `bookings.id`)
- `quote_item_id` uuid (referência lógica a `quote_items.id`)
- `status` text default `'pendente'` — `pendente | confirmado | cancelado`
- `proof_type` text — `email | whatsapp | outro` (nullable)
- `proof_storage_path` text (nullable) — arquivo (PDF, imagem, .eml, screenshot)
- `proof_text` text (nullable) — conteúdo colado (texto do e-mail / mensagem)
- `proof_reference` text (nullable) — código de confirmação / nº de e-mail / link
- `confirmed_at` timestamptz, `confirmed_by` uuid
- `notes` text
- `created_at`, `updated_at`
- unique (`booking_id`, `quote_item_id`)

RLS: leitura para autenticados; insert/update se for dono da reserva (`bookings.created_by = auth.uid()`) ou admin/operacional — mesmo padrão de `booking_suppliers`.

Novo bucket de Storage **`booking-proofs`** (privado), com policies por usuário autenticado para upload/leitura.

### 2. Rota nova: `src/routes/bookings.$bookingId.tsx`

Tela de detalhe com:

- Cabeçalho: cliente, pacote, datas, status da reserva, total.
- **Lista de itens** vinda de `quote_items` (filtrado por `bookings.quote_id`):
  - Para cada item: descrição, qtd, valor.
  - Badge de status (`pendente / confirmado / cancelado`).
  - Linha de comprovante:
    - Select `Tipo`: `E-mail | WhatsApp | Outro`.
    - Campo de referência (assunto do e-mail / nº mensagem / código).
    - Botão **Anexar comprovante** → upload para `booking-proofs/{booking_id}/{item_id}/...` + Textarea opcional para colar conteúdo.
    - Botões **Confirmar item** (grava `status='confirmado'`, `confirmed_at`, `confirmed_by`) e **Cancelar item**.
  - Se já existe registro em `booking_item_confirmations`, pré-carrega os campos e mostra link "Baixar comprovante" (signed URL via `supabase.storage.from('booking-proofs').createSignedUrl(...)`).
- Resumo no topo: `X de Y itens confirmados` + barra de progresso.
- Quando todos os itens estiverem confirmados, oferecer botão para mudar status da reserva para `confirmada`.

Se a reserva não tiver `quote_id`, mostrar aviso "Reserva sem proposta vinculada — adicione uma proposta para listar os itens".

### 3. Ajustes em `src/routes/bookings.tsx`

- Linha da reserva vira clicável (Link para `/bookings/$bookingId`) ou botão "Abrir".
- Coluna nova "Itens": `confirmados / total` (consulta agregada simples por reserva).

### 4. i18n (`src/lib/i18n.tsx`) — pt/en/es

`bookingItems`, `confirmItem`, `cancelItem`, `attachProof`, `proofType`, `proofEmail`, `proofWhatsapp`, `proofOther`, `proofReference`, `proofContent`, `downloadProof`, `itemsConfirmed`, `noQuoteLinked`, `markBookingConfirmed`.

### 5. Detalhes técnicos

- Upload usa o cliente browser do Supabase (`supabase.storage.from('booking-proofs').upload(path, file, { upsert: true })`).
- Upsert em `booking_item_confirmations` por `(booking_id, quote_item_id)`.
- Reaproveita `Table`, `Select`, `Textarea`, `Input`, `Button`, `Badge`, `Card` já existentes; sem novas libs.
- Validação client-side: tamanho máximo de upload 10 MB; tipos aceitos: `.pdf .png .jpg .jpeg .eml .txt`.

### Fora de escopo (pode vir depois)

- Edição inline dos itens da proposta a partir da reserva (continuam sendo editados em `ProposalEditor`).
- Notificação automática ao confirmar todos os itens.
