## Objetivo

Criar uma biblioteca de roteiros e programas de viagem (arquivos .DOC, .DOCX e .PDF) que sirva tanto para consulta humana quanto para alimentar a IA na geração de novas propostas (RAG — busca semântica).

## Banco de dados

Habilitar extensão `pgvector` e criar:

**`itineraries`** — um registro por roteiro
- `id`, `code` (auto), `title`, `original_filename`, `storage_path`, `file_format` (`docx`/`pdf`/`doc`)
- Metadados completos: `destinations text[]`, `duration_days int`, `language`, `tags text[]`
- `trip_type` (lua_de_mel, família, aventura, luxo, cultural, corporativo, grupo, outro)
- `price_range` (econômico, médio, alto, luxo), `estimated_value numeric`, `currency`
- `suppliers_mentioned text[]` (nomes extraídos do conteúdo)
- `customer_id uuid` (cliente original, opcional — link para `customers`)
- `season`, `year int`, `notes`
- `extracted_text text` (texto bruto para busca/IA), `summary text` (resumo gerado pela IA)
- `processing_status` (`pending` / `processing` / `ready` / `failed`), `processing_error`
- `created_by`, `created_at`, `updated_at`

**`itinerary_chunks`** — pedaços do texto com embeddings p/ RAG
- `id`, `itinerary_id`, `chunk_index`, `content text`, `embedding vector(1536)`
- Índice IVFFlat sobre `embedding` para busca por similaridade
- Função SQL `match_itineraries(query_embedding, match_count, filter)` retornando trechos relevantes + metadados

**Bucket de Storage** `itineraries` (privado), com policies para staff.

RLS: leitura para autenticados; insert/update/delete para admin + operacional.

## Edge Function: `process-itinerary`

Roda em background quando um arquivo é enviado:
1. Baixa do Storage
2. Extrai texto: `mammoth` para DOCX, `unpdf` para PDF (`.doc` legado pede conversão prévia — alertamos no upload)
3. Chama Lovable AI (`google/gemini-2.5-flash`) para extrair metadados estruturados (destinos, duração, tipo, fornecedores, faixa de preço, resumo) — retorna JSON
4. Quebra o texto em chunks (~800 tokens com overlap)
5. Gera embeddings via Lovable AI (`google/text-embedding-004`)
6. Salva chunks + atualiza `itineraries` com metadados e `processing_status='ready'`

## Upload em massa (frontend)

Nova rota **`/itineraries`** (item no menu "Biblioteca de Roteiros"):

- **Lista/busca**: filtros por destino, tipo, duração, tags, ano; busca textual + busca semântica ("encontre roteiros parecidos com…"); botão para baixar o arquivo original
- **Detalhe**: metadados, resumo da IA, texto extraído, link p/ cliente original
- **Upload em massa**: drag-and-drop de múltiplos arquivos OU de um `.zip` (extraído no cliente com JSZip). Cada arquivo vira uma linha em `itineraries` com `processing_status='pending'`, sobe pro Storage, e dispara `process-itinerary` em paralelo (com limite de concorrência ~3). Barra de progresso por arquivo + status final.
- **Edição manual** dos metadados depois que a IA preenche (caso queira ajustar).

## Uso pela IA na geração de propostas

Em `generate-proposal-doc` (já existe), adicionar etapa opcional: gerar embedding do briefing/destino do quote, chamar `match_itineraries` para trazer 3-5 trechos mais relevantes, e injetar no prompt como "Exemplos de roteiros anteriores nossos" — IA usa como referência de estilo/estrutura.

## Entregáveis

1. Migration: extensão pgvector, tabelas, índices, função `match_itineraries`, bucket + policies
2. Edge function `process-itinerary`
3. Rota `/itineraries` (lista + upload em massa + detalhe)
4. Item no menu lateral
5. Integração opcional no `generate-proposal-doc`

Confirma para implementar?
