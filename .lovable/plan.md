# Voucher por item confirmado

## Objetivo
Hoje o sistema gera um único voucher por reserva. A nova funcionalidade adiciona, ao confirmar **cada item** da reserva (voo, hotel, serviço, transfer etc.), um botão "Gerar voucher" que cria um voucher individual para aquele item, com possibilidade de **edição posterior**, **envio por e-mail** e **histórico completo de envios**.

## Como vai funcionar para o usuário
Na tela de detalhe da reserva (`/bookings/:id`), em cada cartão de item:

1. Quando o item está com status **Confirmado**, aparece um botão **"Gerar voucher"** ao lado de "Reabrir item".
2. Ao clicar, é criado um voucher para aquele item específico, com código único (ex.: `VCH-AB12-001`), referenciando reserva, item, cliente e prova de confirmação.
3. Após criar, o botão vira **"Abrir voucher"** + badge com o código.
4. Ao clicar em "Abrir voucher", abre uma janela com:
   - **Modo visualização**: voucher formatado (cliente, item, código, datas, contato emergência, observações).
   - Botão **Editar** → entra em modo edição (descrição exibida, data do serviço, horário, local de encontro, contato de emergência, observações, instruções para o cliente). Salva no banco.
   - Botão **Imprimir / Salvar como PDF** (`window.print()` com layout dedicado).
   - Botão **Enviar por e-mail** → sub-dialog com destinatário (pré-preenchido com e-mail do cliente), cc, assunto, corpo (template padrão editável). Envia via edge function.
   - Aba/seção **Histórico de envios**: tabela com todos os envios feitos (data/hora, destinatário, cc, assunto, status `enviado`/`falhou`, mensagem de erro se houver, quem enviou). Mais recente no topo.
5. O voucher antigo "por reserva inteira" da lista `/bookings` continua funcionando.

## Mudanças técnicas

### 1. Banco de dados (migration)

**Alterações em `vouchers`:**
- nova coluna `quote_item_id uuid references quote_items(id) on delete cascade` (nullable, mantém compat).
- novas colunas: `notes text`, `meeting_point text`, `meeting_time text`, `service_date date`, `customer_instructions text`.
- novas colunas: `created_by uuid`, `updated_by uuid`, `updated_at timestamptz default now()`.
- índice `(booking_id, quote_item_id)` e constraint única parcial: um voucher por (booking_id, quote_item_id) quando `quote_item_id` não é nulo.
- trigger `update_updated_at_column` em `vouchers`.

**Nova tabela `voucher_send_log`** (histórico completo de envios):
```
id uuid pk
voucher_id uuid references vouchers(id) on delete cascade
sent_to text not null
sent_cc text
subject text
body_text text
status text not null  -- 'enviado' | 'falhou'
error_message text
gmail_message_id text  -- id retornado pela API do Gmail (se sucesso)
sent_by uuid           -- usuário que enviou
created_at timestamptz default now()
```
- RLS: leitura/insert para usuários com permissão de `bookings.view`/`edit` (mesmo padrão do voucher).
- índice em `(voucher_id, created_at desc)`.

### 2. UI — `src/routes/bookings_.$bookingId.tsx`
- Carregar vouchers da reserva e indexar por `quote_item_id`.
- Para cada item confirmado: sem voucher → botão "Gerar voucher"; com voucher → badge com código + "Abrir voucher".
- Função `generateItemVoucher(item)`: gera código `VCH-{6chars}`, faz `insert`, recarrega.

### 3. Nova janela — `src/components/booking/VoucherDialog.tsx`
- `Dialog` que recebe `voucherId`. Estado `mode: "view" | "edit"`.
- Tabs: **Voucher** (view/edit + imprimir + enviar) e **Histórico** (lista de `voucher_send_log`).
- View com layout impresso-friendly + CSS `@media print`.
- Edit com formulário de todos os campos editáveis, botões Salvar/Cancelar.

### 4. Sub-dialog — `src/components/booking/SendVoucherDialog.tsx`
- Form: `to`, `cc`, `subject`, `bodyText` (defaults i18n).
- Botão "Enviar" chama edge function; ao retornar OK insere linha em `voucher_send_log` com status `enviado` (ou `falhou` + `error_message`), mostra toast e fecha. Aba Histórico atualiza.

### 5. Edge function — `supabase/functions/send-voucher-email/index.ts`
- Recebe `{ voucherId, to, cc, subject, bodyText }`.
- Busca voucher + booking + item + cliente; renderiza HTML do voucher.
- Usa token Gmail do usuário autenticado (mesmo padrão de `gmail.functions.ts`/`gmail-mirror.server.ts`) para enviar via `users.messages.send` (MIME multipart texto+HTML).
- Em sucesso retorna `{ ok: true, gmailMessageId }`; em erro `{ ok: false, error }`. O cliente é quem grava o registro em `voucher_send_log` (mantém RLS simples e não duplica lógica).

### 6. Aba Histórico — `src/components/booking/VoucherSendHistory.tsx`
- Lista linhas de `voucher_send_log` para o voucher (ordenadas por `created_at desc`).
- Cada linha: data/hora, destinatário (+cc se houver), assunto, badge de status (verde `enviado` / vermelho `falhou`), tooltip com `error_message` quando falhou, nome de quem enviou.
- Vazio: "Nenhum envio registrado".

### 7. i18n — `src/lib/i18n.tsx`
Novas chaves (pt/en/es): `generateItemVoucher`, `openItemVoucher`, `voucherForItem`, `voucherEmergencyContact`, `voucherNotes`, `voucherIssuedAt`, `voucherMeetingPoint`, `voucherMeetingTime`, `voucherServiceDate`, `voucherCustomerInstructions`, `printVoucher`, `editVoucher`, `saveVoucher`, `sendVoucherByEmail`, `sendVoucherEmailSubject`, `sendVoucherEmailBody`, `voucherSent`, `voucherSendFailed`, `voucherSendHistory`, `voucherSendHistoryEmpty`, `sentAt`, `sentBy`, `sentTo`.

## Validação
- Confirmar item → "Gerar voucher" aparece.
- Gerar → mostra código + "Abrir voucher".
- Abrir → ver/editar/salvar campos.
- Imprimir → preview limpo.
- Enviar por e-mail → cliente recebe; aba Histórico mostra novo registro com status `enviado`.
- Forçar erro (e-mail inválido) → registro com status `falhou` + erro visível.
- Voucher por reserva inteira em `/bookings` continua funcionando.

## Fora do escopo
- Anexar voucher como PDF no e-mail (envio é HTML inline; PDF via "Imprimir → Salvar como PDF" do navegador).
- Webhooks de bounce/complaint do Gmail.
