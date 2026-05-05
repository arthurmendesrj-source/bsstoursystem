## Entendimento

- **Clientes B2B** = coluna `Conta` + `Conta Email` da planilha (são agências/empresas parceiras). 242 únicos.
- **Fornecedores** = coluna `Fornecedor / Descrição` das linhas com `Tipo = HOTEL` + `Cidade`. 409 únicos.
- **Ignorar** completamente a coluna `Cliente(s)` (passageiros finais).

## Importação

### 1. Clientes B2B (`customers`) — 242 registros
- `type` = `pj` (todos, são agências B2B)
- `full_name` ← `Conta`
- `company_name` ← `Conta` (mesmo valor, já que são empresas)
- Parsear `Conta Email` (que pode ter múltiplas linhas):
  - linha contendo `@` → `email` (primeira) e `secondary_email` (segunda, se houver)
  - linha com `+` ou só dígitos → `phone`
- `status` = `ativo`
- `tags` = `['B2B']`
- `origin` = `'Importação Analitica 2025'`
- `notes` = `'Importado da planilha Analitica_2025'`

### 2. Fornecedores (`suppliers`) — 409 registros
- `name` ← `Fornecedor / Descrição`
- `category` = `hotel`
- `address_city` ← `Cidade`
- `address_country` ← inferido por cidade (mapa simples Bogotá/Cartagena→Colômbia, Rio/SP/Foz→Brasil, BA/Mendoza→Argentina, Cusco/Lima→Peru, La Paz/Uyuni→Bolívia, Santiago/Atacama→Chile, etc.); nulo se não houver match
- `default_currency` = `USD`
- `status` = `ativo`
- `notes` = `'Importado da planilha Analitica_2025'`

### 3. Deduplicação
Antes de inserir: pular se já existir registro com mesmo nome (case-insensitive) na tabela.

### 4. Execução
- Script Python lê a planilha, faz parsing/dedup e gera SQL `INSERT` em batches.
- Executa via `psql` (bypassa RLS).
- `created_by` setado para o seu user (busco o admin único em `profiles`/`user_roles`).
- Triggers `set_customer_code` / `set_supplier_code` geram o `code` automaticamente.

Confirma para aplicar?