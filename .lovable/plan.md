## Adicionar botão Editar na lista de Reservas

### Objetivo
Permitir editar uma reserva direto da tela `/bookings` (cliente, pacote, datas, valor, moeda, status) sem precisar abrir o detalhe.

### Mudanças

**`src/routes/bookings.tsx`**
- Adicionar botão **Editar** (ícone `Pencil`) na coluna **Ações** de cada linha, ao lado do "Abrir reserva". Visível apenas com permissão `bookings.edit`.
- Reutilizar o mesmo `<Dialog>` do "Novo", transformando-o em modo dual (criar/editar):
  - Estado `editingId: string | null` além do `form` existente.
  - Ao clicar em editar: preencher `form` com os dados da reserva e abrir o dialog. Título muda para "Editar Reserva".
  - `submit`: se `editingId` → `update().eq('id', editingId)`; senão → `insert` (comportamento atual).
  - Ao fechar/limpar: resetar `editingId` para `null`.
- Campos editáveis no form (já existem): cliente, pacote, data ida/volta, valor, moeda, status.

### Fora do escopo
- Não mexer em `/bookings/$bookingId` (detalhe).
- Não mexer em vouchers, invoice, itens da proposta.
- Sem mudanças de schema/RLS — `bookings` já tem update policy.

### Arquivos
- Editar: `src/routes/bookings.tsx`
