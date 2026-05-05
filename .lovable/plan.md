
## Objetivo

Adicionar associação cruzada entre comprovantes de reserva e e-mails/mensagens, e dar à aba E-mail uma busca rica para vincular qualquer mensagem a leads, clientes, fornecedores, propostas ou reservas — como já existe em Atendimento.

---

## 1. Página da Reserva (`src/routes/bookings_.$bookingId.tsx`)

Hoje cada item já tem **Anexar comprovante**. Adicionar ao lado um botão **Associar** (ícone `Link2`) que abre um Dialog com duas abas:

### Aba "E-mail" (caixa de entrada)
- Lista os últimos 50 e-mails da tabela `emails` (mesma fonte da `/email`), com busca por `subject`, `from_name`, `from_email`, `snippet`.
- Filtros rápidos: "Não lido", "Vinculados a este cliente" (`emails.customer_id = booking.customer_id`).
- Ao escolher um e-mail: grava em `booking_item_confirmations`:
  - `proof_type = 'email'`
  - `proof_reference = "<assunto> — <from>"`
  - `proof_text = snippet` (ou `body_text` se já carregado)
  - novo campo `proof_email_id` (FK lógica para `emails.id`)
- Mostra link "Abrir e-mail" (vai para `/email`).

### Aba "WhatsApp"
- Como ainda não existe tabela de mensagens WhatsApp, oferece um formulário simples:
  - Nº de telefone, data/hora, conteúdo da mensagem (Textarea), upload opcional de print.
- Salva como `proof_type = 'whatsapp'`, `proof_reference = telefone`, `proof_text = conteúdo`, e o print (se houver) vai pro storage `booking-proofs/...` em `proof_storage_path`.

### Migração necessária

```sql
ALTER TABLE public.booking_item_confirmations
  ADD COLUMN proof_email_id uuid;
```

Sem FK rígida (segue padrão das outras tabelas). Não muda RLS.

---

## 2. Página E-mail (`src/components/email/EmailPanel.tsx`)

Hoje só existe o painel "Sugestões" baseado no e-mail do remetente. Adicionar um botão **Associar** (`Link2`) ao lado das ações Reply/Forward/Archive do e-mail selecionado, que abre um Dialog de busca com Tabs:

### Tabs do diálogo de associação
Mesmo conjunto da aba Atendimento:

1. **Lead** — busca por `name`, `code`, `email`, `phone`, `destination`. Atualiza `emails.lead_id` (e `customer_id` se o lead tiver cliente vinculado).
2. **Cliente** — busca por `full_name`, `email`, `phone`, `code`. Atualiza `emails.customer_id`.
3. **Fornecedor** — busca por `name`, `email`, `code`, `category`. Atualiza `emails.supplier_id`.
4. **Proposta (Invoice)** — busca por `quotes.id` curto, `customer.full_name`, `lead.name`. Ao selecionar, vincula ao `lead_id`/`customer_id` da proposta.
5. **Reserva** — busca por `bookings.id`, cliente, datas. Vincula a `lead_id`/`customer_id` da reserva.

### Comportamento
- Cada Tab mostra um `Input` de busca + lista de até 20 resultados (Card clicável).
- Ao clicar num resultado: faz `UPDATE` em `emails` com os ids correspondentes, dispara `toast.success(t("emailLinked"))`, fecha o diálogo, recarrega a lista.
- Mantém a área "Sugestões" atual (linkagem rápida por e-mail do remetente).

---

## 3. i18n (`src/lib/i18n.tsx`)

Novas chaves (pt/en/es):
`associate`, `associateProof`, `associateEmailTab`, `associateWhatsappTab`, `searchPlaceholderAssociate`, `linkLead`, `linkCustomer`, `linkSupplier`, `linkQuote`, `linkBooking`, `whatsappPhone`, `whatsappContent`, `noResults`.

---

## 4. Detalhes técnicos

- O Dialog de busca vira componente reutilizável: `src/components/AssociateDialog.tsx`, com prop `mode: "emailToEntity" | "bookingItemToProof"`.
- Buscas usam `ilike` em colunas indexadas (já é padrão no projeto), `limit(20)`, `order by created_at desc`.
- Para reservas/propostas, o componente faz join com `customers` e `leads` para mostrar rótulo amigável.
- Upload do print do WhatsApp reaproveita o bucket `booking-proofs` e a função `onUpload` já existente.
- Após associar um e-mail a um item, mostrar badge "📧 E-mail vinculado" e o assunto no card do item.

---

## Fora de escopo

- Integração real com WhatsApp Business API (continua manual).
- Sincronização de e-mails associados de volta para a timeline do lead (já acontece via `emails.lead_id`).
