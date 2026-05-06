## Importar tarifários ADA Tours 2026

### Arquivos recebidos (6 planilhas, 2 idiomas × 3 tipos)

- **Serviços Brasil** (RIO, FOZ, SP, SALVADOR, AMAZON, RECIFE, NATAL, FORTALEZA, BRASILIA)
- **Serviços América Latina** (ARGENTINA, CHILE, PERU, URUGUAY, COLOMBIA)
- **Hotéis Brasil** (RIO, FOZ, AMAZON, BUZIOS, NORONHA, PANTANAL N/S, PORTO GALINHAS, PIPA, SP)

Cada um em duas versões (English guide / Russian guide). Estrutura: matriz pivot com **linhas = serviço** e **colunas = faixas de PAX** (1, 2, 3, 4, 5-6, 7-8, 9-10, 11-12, 13-14, 15-21). Subseções tipo "PRIVATE TRANSFERS / DRIVER ONLY", "WITH ENGLISH GUIDE", "VIP SERVICES", "FULL DAY TOURS", etc. Hotéis têm colunas SGL/DBL/TPL e categorias.

### Decisão de arquitetura

A tabela `supplier_rates` já existe e suporta isso (`pax_min`, `pax_max`, `unit_price`, `currency`, `service_type`, `city`, `category`, `language`, etc). **Não precisa nova tabela** — vamos fazer "unpivot" das matrizes em linhas individuais.

### Fornecedor

Criar/encontrar fornecedor único **"ADA Tours"** (categoria `receptivo`/`outro`, default_currency USD). Todas as tarifas ficam vinculadas a ele.

### Plano de execução

**1. Script Python local** (`/tmp/parse_ada.py`) — não vai para o app:
- Carrega cada `.xlsx`, percorre cada sheet (= cidade)
- Detecta linha de cabeçalho com faixas de PAX (regex `\d+(\s*-\s*\d+)?`)
- Detecta "section headers" (linhas só na coluna A, sem preço): viram `category` (ex: "PRIVATE TRANSFERS - DRIVER ONLY", "WITH ENGLISH GUIDE", "VIP SERVICES", "FULL DAY TOURS")
- Para cada linha de serviço × cada coluna de pax → 1 registro:
  - `service_name` = texto coluna A
  - `service_type` = inferido do nome (transfer/tour/hotel/restaurant/outro)
  - `city` = nome da sheet
  - `pax_min`/`pax_max` = parse da faixa
  - `unit_price` = valor numérico (descarta "u/r")
  - `currency` = USD (por nota "ALL PRICES GIVE IN U$")
  - `unit` = `per_person`
  - `language` = "english" ou "russian" (do nome do arquivo)
  - `category` = section header
  - `raw_excerpt` = linha bruta (debug)
- Hotéis: detecta colunas SGL/DBL/TPL/QUAD → gera linhas separadas com `category` = nome do hotel + tipo de quarto
- Pula só versão "English" para não duplicar (Russian é mesma tarifa, só guia diferente — ou marcamos com `language` distinto)

**2. Gera SQL** com `INSERT INTO supplier_rates (...) VALUES (...)` em lotes de 200.

**3. Migration** (única e curta): garante fornecedor "ADA Tours 2026" em `suppliers` se não existir, depois roda os inserts. Usa `INSERT ... ON CONFLICT DO NOTHING` numa unique constraint nova `(supplier_id, service_name, city, pax_min, pax_max, language, category)` para ser idempotente.

**4. UI**: nada a alterar agora — `/suppliers/<id>` já lista rates. Em passo separado posso adicionar busca de tarifas no editor de propostas (assistente "buscar serviço por cidade/pax").

### O que preciso confirmar antes de gerar

1. **Idiomas**: importar as duas versões (english + russian) ou só uma? Os preços parecem idênticos — sugiro **só english** para evitar duplicação.
2. **Hotéis**: importar valores por categoria de quarto como linhas separadas (uma por SGL, DBL, TPL) com `unit` = `per_night` e `category` = nome do hotel?
3. **Fornecedor**: usar **"ADA Tours"** existente (se houver) ou criar novo "ADA Tours 2026"?

### Arquivos afetados

- `/tmp/parse_ada.py` (script de parsing — não vai pro repo)
- 1 migration SQL: cria unique constraint em `supplier_rates` + INSERTs em lote
- Nenhuma mudança em código React/TS

### Próximo passo após import

Sugerido: adicionar no editor de propostas botão "Buscar tarifa ADA" que filtra `supplier_rates` por cidade + faixa de pax e insere como item da cotação.
