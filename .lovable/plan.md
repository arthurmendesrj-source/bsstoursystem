## Objetivo

Processar os ZIPs anexados (HOTEIS_… e 2027…) em duas fases sequenciais:

1. **Fase 1 — Upload**: enviar todos os PDFs para o bucket `supplier-docs` sem criar fornecedores ainda.
2. **Fase 2 — Análise e cadastro**: ler cada PDF com IA (Lovable AI / `google/gemini-2.5-flash`), extrair dados do hotel e criar/atualizar `suppliers` (categoria `hotel`), vinculando o documento já enviado.

Aproveita a infraestrutura existente: bucket `supplier-docs`, tabela `supplier_documents`, `suppliers` (enum `hotel`) e o padrão de extração já implementado em `supabase/functions/extract-supplier-contacts`.

---

## Fase 1 — Upload em massa (executar agora)

Script `code--exec` (Node/TS one-off, sem UI):

1. Descompactar `/tmp/hoteis.zip` e `/tmp/2027.zip` em `/tmp/hoteis_unzipped/`.
2. Iterar recursivamente todos os `.pdf` (ignorar `.png`, pastas vazias, `image00*`).
3. Para cada PDF, derivar metadados pelo path:
   - `country` = primeiro segmento após `HOTEIS /<ano>/` (BRASIL, ARGENTINA, PERU, CHILE…)
   - `city` = segundo segmento (FOZ DE IGUACU, BUZIOS…)
   - `hotel_folder` = terceiro segmento quando existir (ex: `KA BRU`, `LABORIE 2025e2026`)
   - `year` = pasta `2025`/`2026`/`2027`
   - `filename` (limpo) e `storage_path` único: `pending/<uuid>-<slug(filename)>.pdf`
4. Upload para `storage://supplier-docs/<storage_path>` via `supabaseAdmin` (service role).
5. Gravar uma fila intermediária em `/mnt/documents/hoteis_upload_manifest.json` com a lista de uploads + metadados extraídos do path. **Nada é inserido em `suppliers` ou `supplier_documents` ainda** — assim você pode revisar antes da Fase 2.
6. Ao final, retornar um resumo: quantos uploads OK, quantos falharam, total de bytes.

Saída: arquivo `hoteis_upload_manifest.json` em `/mnt/documents/` (downloadable) + tabela resumo no chat.

---

## Fase 2 — Análise e criação de fornecedores (após você aprovar a Fase 1)

Script separado que lê o manifest:

1. Para cada PDF:
   - Baixar do storage, extrair texto com `unpdf` (mesmo padrão da edge function existente).
   - Chamar Lovable AI (`google/gemini-2.5-flash`) com tool-calling para devolver JSON estruturado:
     - `hotel_name`, `trade_name`, `address_city`, `address_state`, `address_country`, `email`, `phone`, `whatsapp`, `website`, `default_currency` (BRL/USD/ARS…), `notes` (resumo), `tax_id` se houver.
   - Fallback: se IA não retornar nome, usar nome do arquivo + cidade.
2. **Dedup por nome normalizado + cidade** (slug). Antes de inserir, buscar `suppliers` com `category='hotel'` e nome similar — se existir, reaproveitar o id (não duplicar).
3. Inserir/atualizar em `suppliers` com `category='hotel'`, `status='ativo'`.
4. Mover o PDF em storage de `pending/<...>` para `<supplier_id>/<...>` e inserir `supplier_documents` (kind=`tarifario`, year, original_filename, file_format=`pdf`).
5. Gravar log final em `/mnt/documents/hoteis_import_report.json` com mapping arquivo → supplier_id, e contagens (criados / reaproveitados / falharam).

Sem migração de banco — todas as colunas necessárias já existem.

---

## Observações técnicas

- `psql` está disponível, mas as inserções usarão `supabase-js` com service role para respeitar triggers (`set_supplier_code` gera o código automaticamente).
- IA usa `LOVABLE_API_KEY` (já configurada) — sem custo de API key adicional.
- Total: ~76 PDFs, ~50 MB. Upload em paralelo limitado (concorrência 5) para não estourar limites.
- Fica fora do escopo: criação de tarifas (`supplier_rates`) — isso é um passo posterior usando `extract-supplier-rates` que já existe.

---

## Perguntas antes de iniciar a Fase 1

1. Devo separar fornecedores **por hotel individual** (cada PDF = 1 fornecedor) ou **agrupar PDFs do mesmo hotel** (ex.: VIVAZ CATARATAS 2025 + 2026 + 2027 viram 1 fornecedor com 3 documentos)? Recomendo agrupar.
2. Para PDFs que listam **vários hotéis** (ex: `Hoteis Casa Andina PERU 2026.pdf`, `Sonesta TODO PERU`, `Wholesales`), devo criar **um fornecedor por hotel listado dentro do PDF** ou **um único fornecedor "rede"** (Casa Andina, Sonesta)? Recomendo um por rede + notas com lista de unidades.