## Objetivo

Reformular a tela `/biblia` (Bíblia Operacional) para apresentar a tabela "Tráfego" no layout do screenshot, com as colunas:

**Serviço · Hotel · Motorista · Fornecedor · Guia · Data · P (hora) · Cidade · Pax · Fatura · Nome Pax**

Hoje a tabela mostra apenas: Invoice, Pax (nome), Tipo, Descrição, Cidade, Data, Hora, Status, Ações. Faltam os campos `hotel`, `motorista`, `fornecedor`, `guia` e a quantidade de pax (numérica) — eles não existem em `operations_activities`.

## Mudanças

### 1. Banco — migration (`supabase/migrations/...`)
Adicionar à tabela `public.operations_activities` colunas opcionais:
- `hotel text`
- `driver text` (Motorista)
- `supplier text` (Fornecedor)
- `guide text` (Guia)
- `pax_count integer` (quantidade de pax — distinto de `pax_name`)

Todas nullable, sem default. Sem alterar políticas RLS existentes.

### 2. Tipos / componente de edição
- `src/components/BibliaActivityDialog.tsx`
  - Estender `ActivityRow` com os novos campos.
  - Adicionar inputs no diálogo: Hotel, Motorista, Fornecedor, Guia, Pax (number). O campo "Descrição" passa a ser rotulado **Serviço** (mesma coluna `description` no banco).
  - Incluir os novos campos no payload de insert/update.

### 3. Tela `/biblia` — `src/routes/biblia.tsx`
- Cabeçalho da seção: título **Tráfego** (mantendo o título maior "Bíblia Operacional" acima) e barra de busca destacada à direita, igual ao screenshot.
- Substituir o cabeçalho da tabela pelos novos campos na ordem:
  `Serviço | Hotel | Motorista | Fornecedor | Guia | Data | P | Cidade | Pax | Fatura | Nome Pax | Status | Ações`
  - "Serviço" = `description`
  - "P" = `activity_time` (HH:mm)
  - "Fatura" = `invoice_code` (mantendo o link para `/bookings/$bookingId` quando houver)
  - "Pax" = `pax_count`
  - "Nome Pax" = `pax_name`
- Manter Status + Ações no final (úteis para operação, não fazem parte do screenshot mas seguem visíveis).
- Ajustar a busca para considerar também hotel, motorista, fornecedor, guia, fatura e nome pax.
- Linhas zebradas (faixas verde-água claras alternadas) reproduzindo o visual do screenshot.

### 4. Importar de Reservas
A função `importFromBookings` continua mapeando o que já existe (description/city/date) — os novos campos ficam vazios na importação automática e são preenchidos manualmente, salvo se o usuário pedir um mapeamento específico no futuro.

### 5. Sem mudanças em
- RLS / autenticação
- Rotas / navegação
- `src/integrations/supabase/types.ts` (regenerado automaticamente)

## Observações
- Nenhum dado existente é perdido; as novas colunas começam vazias para registros antigos.
- Caso a importação de reservas precise popular Hotel/Motorista/Fornecedor/Guia automaticamente, é uma tarefa separada (depende de onde esses dados estão hoje em `quote_items` / `bookings`).
