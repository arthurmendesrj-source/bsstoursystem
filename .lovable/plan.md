## Plano

1. **Exibir invoice na página detalhe da reserva**
   - Atualizar `src/routes/bookings_.$bookingId.tsx` para buscar `invoices.number` da reserva aberta.
   - Mostrar o número do invoice no cabeçalho da reserva, junto com data, valor e status.
   - Corrigir também o erro de HTML atual no cabeçalho (`div`/`Badge` dentro de `p`) para evitar falha de hidratação.

2. **Garantir fallback para reservas já convertidas**
   - Se a reserva tiver `quote_id`, buscar invoice tanto por `booking_id` quanto por `quote_id`.
   - Se existir invoice por `quote_id` mas sem `booking_id`, passar a exibir mesmo assim.

3. **Criar invoice ausente para a reserva atual quando aplicável**
   - Para reservas convertidas antes da última alteração, como a reserva aberta agora, criar automaticamente o invoice faltante ao carregar a página se não houver invoice vinculada.
   - Usar o padrão já definido: `IN<code do lead>`; neste caso seria `INAE090526`.
   - Vincular ao `booking_id`, `quote_id`, total, moeda e usuário criador quando disponível.

4. **Melhorar a conversão futura**
   - Ajustar `ProposalEditor.tsx` e `NotificationBell.tsx` para não ignorarem erro ao inserir/atualizar invoice.
   - Se a reserva for criada mas o invoice falhar, mostrar aviso claro em vez de parecer que tudo foi concluído.

## Resultado esperado

- O número do invoice aparece automaticamente na reserva detalhada.
- A reserva atual deixa de aparecer sem invoice após o carregamento.
- Novas conversões continuam criando invoice automaticamente.
- O cabeçalho da reserva fica estável sem erro de hidratação.