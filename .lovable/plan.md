## Objetivo
Permitir que o campo **Total** dos diálogos de Hotel, Voo e Serviço seja sempre editável manualmente, sem depender da permissão "editar custo".

## Mudanças

### `src/components/proposal/HotelDialog.tsx`
- Remover o gate `canEditCost`/`canViewCost` no campo Total.
- O bloco do Total deixa de ser condicional: sempre renderizado e sempre editável (`disabled` removido).
- Manter `usePermissions` apenas se ainda for usado em outro ponto; caso contrário, remover o import.

### `src/components/proposal/ServiceDialog.tsx`
- Mesma mudança: Total sempre visível e editável, sem `canViewCost`/`canEditCost`.

### `src/components/proposal/FlightDialog.tsx`
- O Total já é editável; nenhuma mudança necessária (confirmar).

## Comportamento
- Qualquer usuário com acesso ao diálogo pode digitar o valor em **Total**.
- O cálculo de `unit_cost` continua sendo `total / noites` (hotel) ou `total / pax` (serviço), preservando os totais já existentes da proposta.
- Nenhuma alteração de schema, RLS ou de permissões do sistema — somente UI nos dois diálogos.
