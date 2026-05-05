# Bíblia — Ferramenta Operacional

Reformular a aba **Bíblia** para servir o time operacional: lista de atividades do dia (com hora de execução), vinculada a reservas mas também alimentável manualmente e totalmente editável.

## Colunas da tabela
- **Cód. Invoice** (ex.: `IN<codigo_lead>`) — link para a reserva quando houver
- **Nome Pax** (cliente principal ou pax informado)
- **Tipo** (hotel, transfer, passeio, voo, outro…)
- **Data** de execução
- **Hora** de execução
- **Descrição** (cidade / fornecedor / observação curta)
- **Status** (pendente / confirmado / executado / cancelado)
- **Ações** (editar, excluir)

## Filtros (topo da página)
- **Data** — padrão: **hoje**; opção "intervalo" (de/até)
- **Tipo** de serviço (multi)
- **Status**
- **Busca** livre (pax, invoice, descrição)
- Botão **Limpar**, **Exportar CSV**, **Importar de Reservas**, **+ Nova atividade**

## Ações principais
1. **Importar de Reservas** — varre `quote_items` cujas reservas tenham `departure_date` no intervalo escolhido e cria registros na tabela operacional (idempotente: pula itens já importados pelo mesmo `quote_item_id`).
2. **+ Nova atividade** — dialog para criar manualmente (sem precisar de reserva).
3. **Editar** linha — dialog com todos os campos editáveis (inclusive itens importados; edição não altera o `quote_items` original, vive apenas na tabela operacional).
4. **Excluir** linha.

## Modelo de dados (nova tabela)

```text
operations_activities
  id uuid pk
  booking_id uuid null               -- referência opcional à reserva
  quote_item_id uuid null unique     -- origem da importação (idempotência)
  invoice_code text null             -- copiado no import; editável
  pax_name text null
  kind text not null default 'service'
  description text null
  city text null
  activity_date date null
  activity_time time null
  status text not null default 'pendente'
  notes text null
  source text not null default 'manual'   -- 'manual' | 'imported'
  created_by uuid not null
  created_at / updated_at timestamptz
```

RLS: leitura para autenticados; insert/update/delete para o criador, admin e `operacional` (mesmo padrão de `booking_item_confirmations`).

## Lógica de importação
- Para cada booking no intervalo (com `lead_id`), monta `invoice_code = "IN" + leads.code`.
- Para cada `quote_item` desse booking ainda não presente em `operations_activities`, insere:
  - `pax_name` = cliente principal do booking (`customers.full_name`)
  - `kind`, `description`, `city`, `activity_date = item_date` (ou `departure_date` quando vazio)
  - `activity_time` = null (operador preenche)
  - `status = 'pendente'`
  - `source = 'imported'`
- Toast com total importado / pulado.

## Mudanças nos arquivos
- **migração SQL**: criar tabela `operations_activities` + índices (`activity_date`, `booking_id`) + RLS + trigger `updated_at`.
- **`src/routes/biblia.tsx`**: reescrever página inteira (lista, filtros com data padrão hoje, importar, criar/editar/excluir, exportar CSV).
- **`src/components/BibliaActivityDialog.tsx`** (novo): formulário de criar/editar (campos: invoice_code, pax_name, kind, description, city, activity_date, activity_time, status, notes, booking_id opcional via busca).
- **`src/lib/i18n.tsx`**: novas chaves (`bibliaImport`, `bibliaNewActivity`, `bibliaImported`, `invoiceCodeShort`, `paxName`, `executionTime`, `bibliaSourceManual`, `bibliaSourceImported`, status, etc.) em pt/en/es.
- **`src/components/AppShell.tsx`**: mantém item "Bíblia" já presente.

## Fora de escopo
- Edição reversa em `quote_items` original.
- Geração automática ao criar item de reserva (poderá ser adicionada depois via trigger).
