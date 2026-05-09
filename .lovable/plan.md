## Permitir desfazer aprovação de proposta e confirmação de reserva

Hoje, depois de aprovar uma proposta (`quotes.status = "aprovada"`) ou confirmar uma reserva/itens (`bookings.status = "confirmada"`, `booking_item_confirmations.status = "confirmado"`), não há caminho de volta no UI. Vamos adicionar botões de **reversão** restritos a quem tem permissão de aprovar/editar.

### 1. `src/components/proposal/ProposalEditor.tsx` — Desfazer aprovação

- Adicionar função `unapprove()` que volta `quotes.status` para `"enviada"` (ou `"rascunho"` se nunca foi enviada — usar `"enviada"` como padrão seguro).
- No cabeçalho, quando `isClosed && canApprove`, exibir botão **"Reabrir proposta"** (ícone `RotateCcw`, variant `outline`) ao lado dos demais.
- Pedir confirmação (`confirm(...)`) antes de reverter, alertando que a proposta voltará a ser editável.
- Após reverter, recarregar via `load()` e disparar `onSaved?.()`.

### 2. `src/routes/bookings_.$bookingId.tsx` — Desfazer confirmação da reserva e dos itens

- **Reserva**: quando `booking.status === "confirmada"` e `can("bookings", "edit")`, mostrar botão **"Reabrir reserva"** ao lado/no lugar do "Marcar confirmada", que volta `bookings.status` para `"pre_reserva"`. Pedir confirmação.
- **Itens**: para cada item cujo `status === "confirmado"` ou `"cancelado"`, exibir botão **"Reverter para pendente"** (variant ghost, ícone `RotateCcw`), que chama `setStatus(item, "pendente")` e limpa `confirmed_at`/`confirmed_by` (já tratado pelo `persist` existente quando status ≠ "confirmado").

### 3. `src/routes/bookings.tsx` — sem mudanças

A lista já tem um `Select` que permite escolher qualquer status (`STATUSES`), incluindo voltar de `confirmada` para `pre_reserva`. Apenas confirmar que continua liberado para quem tem permissão (já está com `disabled={!can("bookings", "edit")}`).

### 4. i18n

Adicionar chaves em `src/lib/i18n.tsx` (PT/EN/ES): `reopenProposal`, `reopenProposalConfirm`, `reopenBooking`, `reopenBookingConfirm`, `revertToPending`.

### Validação

1. Proposta aprovada → botão "Reabrir proposta" aparece para quem tem permissão `quotes.approve`. Clicar → confirma → status volta a `enviada`, badge volta ao normal, edição liberada.
2. Reserva confirmada → botão "Reabrir reserva" aparece. Clicar → confirma → status volta a `pre_reserva`.
3. Item confirmado/cancelado → botão "Reverter para pendente" aparece. Clicar → volta a `pendente`, contador de confirmados atualiza.
4. Sem permissão → botões não aparecem.
