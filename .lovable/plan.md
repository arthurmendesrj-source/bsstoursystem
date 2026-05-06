## Adicionar voo na Proposta (em atendimento)

### O que será feito

Na aba **Proposta** dentro do atendimento (workspace), adicionar um botão **"Adicionar voo"** ao lado de "Adicionar hotel" / "Adicionar serviço". Esse botão abre um popup com os campos do layout enviado.

### Campos do popup

- **Data*** (date picker)
- **Número*** (texto — ex.: AA1234)
- **De*** (texto — origem, ex.: GRU)
- **Para*** (texto — destino, ex.: JFK)
- **Partida*** (hora — HH:mm)
- **Chegada*** (hora — HH:mm)
- **Pax*** (número, mínimo 1)
- **Total** (número, opcional — valor)
- **Notas** (textarea, opcional)

Botões: **Cancelar** e **Salvar**. Validação de obrigatórios (mostra "Obrigatório" em vermelho como no mockup).

### Banco de dados

Criar tabela `quote_flights` vinculada à proposta (`quote_id`):

```text
id uuid pk
quote_id uuid -> quotes.id (cascade delete)
flight_date date not null
flight_number text not null
from_code text not null
to_code text not null
departure_time time not null
arrival_time time
pax int not null default 1
total numeric(12,2)
notes text
created_at, updated_at timestamptz
created_by uuid
```

RLS: mesmas regras de `quote_items` (acesso via dono da quote/lead).

### Frontend

1. **Novo componente** `src/components/proposal/FlightDialog.tsx`
   - Dialog com formulário acima, salva em `quote_flights`.
   - Reutiliza shadcn Dialog/Input/Label/Button/Calendar/Popover.

2. **`src/components/proposal/ProposalEditor.tsx`**
   - Novo botão **"Adicionar voo"** (ícone `Plane` da lucide) ao lado dos botões existentes.
   - Estado `flightDialogOpen` + render do `<FlightDialog />`.
   - Carregar e listar voos abaixo dos serviços em uma tabela compacta (Data | Voo | De → Para | Partida | Chegada | Pax | Total | ações editar/excluir).

3. **i18n** (`src/lib/i18n.tsx`): chaves `addFlight`, `flights`, labels do form (Data, Número, De, Para, Partida, Chegada, Pax, Total, Notas, Obrigatório).

### Fora do escopo

- Integração com APIs de companhias aéreas / autocomplete de aeroportos (apenas texto livre por enquanto).
- Inclusão dos voos no total financeiro da proposta (campo `total` é apenas informativo nesta primeira versão; podemos somar depois se você quiser).