## Objetivo
Adicionar botão **Criar Invoice** no editor de propostas, sempre visível, que cria apenas o registro de invoice (sem booking) vinculado à proposta atual e disponível na aba Invoice.

## Mudanças

### `src/components/proposal/ProposalEditor.tsx`
- Nova função `createInvoiceOnly()`:
  - Valida permissão (`canCreateBooking` ou `canEdit` — usar a mesma gate de "Converter para reserva").
  - Calcula `invoiceNumber = leadCode ? "IN"+leadCode : "IN"+quote.id.slice(0,8)`.
  - Se já existir invoice com esse número, faz `update` (atualiza `quote_id`, `customer_id`, `currency`, `subtotal`, `total`) e avisa "Invoice já existia, atualizado".
  - Caso contrário, `insert` em `public.invoices` com: `number`, `quote_id`, `customer_id`, `currency`, `subtotal = total = quote.total_amount`, `status='draft'`, `created_by=uid`, `issued_at=now`. `booking_id` fica `null`.
  - Toast de sucesso e `onSaved?.()`.
- Novo botão na barra de ações (próximo a "Gerar Documento"), visível em `mode === "proposal"` sempre (qualquer status):
  ```
  <Button size="sm" variant="outline" onClick={createInvoiceOnly}>
    <Receipt className="h-4 w-4 mr-1" /> Criar Invoice
  </Button>
  ```
- Mantém os botões existentes ("Propor invoice", "Converter para reserva") inalterados.

## Comportamento
- Clicar em **Criar Invoice** → cria o invoice imediatamente (status draft) e ele aparece na aba Invoice da proposta/lead, mesmo sem reserva.
- Idempotente: clicar de novo apenas atualiza o invoice existente com o mesmo número.

## Não muda
- Schema do banco, RLS, permissões.
- Fluxo de "Converter para reserva" continua criando booking + invoice.
