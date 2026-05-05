## Nova aba "Bíblia" — registro completo de serviços reservados

Criar uma nova página acessível pela barra lateral (caixa de ferramentas) chamada **Bíblia**, que consolida todos os serviços de todas as reservas, com filtros por tipo de serviço e datas.

### O que é

Uma "Bíblia operacional" — visão única, em formato de tabela, com **todos os itens de todas as reservas** (extraídos de `quote_items` via `bookings.quote_id`), permitindo à operação consultar rapidamente "quem está hospedado em qual hotel em tal data", "quais voos saem essa semana", etc.

### Página `/biblia`

Colunas da tabela:
- Reserva (código curto + cliente, com link para `/bookings/{id}`)
- Tipo de serviço (`quote_items.kind` — hotel, voo, transfer, passeio, serviço…)
- Descrição
- Cidade (`quote_items.city`)
- Data início (`quote_items.item_date`)
- Data fim / check-out (`quote_items.check_out`)
- Pax / Qtd
- Status do item (de `booking_item_confirmations.status`: pendente / confirmado / cancelado)
- Valor

### Filtros (topo da página)
- **Tipo de serviço** — multi-select com os valores distintos de `kind` presentes na base
- **Período** — dois date pickers (data inicial / data final) que filtram pelo `item_date` (ou `check_out` quando aplicável)
- **Status do item** — pendente / confirmado / cancelado / todos
- **Busca livre** — descrição, cidade, código da reserva, nome do cliente
- Botão **Limpar filtros** e botão **Exportar CSV**

### Acesso
- Novo item na sidebar `AppShell.tsx`: **Bíblia** com ícone `BookOpen`, rota `/biblia`, posicionado logo abaixo de "Reservas".

### Detalhes técnicos

- Nova rota: `src/routes/biblia.tsx` (envolta em `AuthGate` + `AppShell`).
- Query única: `quote_items` join com `bookings` (via `quote_id`) e `customers` (via `bookings.customer_id`); só traz itens cujo `quote_id` pertence a uma reserva. Carrega também `booking_item_confirmations` para exibir status por item.
- Filtros aplicados client-side sobre o resultado (o volume cabe — paginação de 200/página com `order by item_date desc nulls last`).
- Sem migração de banco: tudo já existe em `quote_items` + `bookings` + `booking_item_confirmations`.
- Novas chaves i18n (pt/en/es): `bibliaMenu`, `bibliaTitle`, `bibliaIntro`, `filterServiceType`, `filterPeriod`, `filterStatus`, `clearFilters`, `exportCsv`, `noServicesFound`.
- Date pickers: shadcn `Calendar` + `Popover` com `pointer-events-auto`.

### Fora de escopo
- Edição de itens nesta tela (read-only; clicar em "Reserva" leva ao detalhe da reserva onde já existe a confirmação item-a-item).
- Agrupamentos hierárquicos (por hotel/fornecedor) — pode vir depois se necessário.