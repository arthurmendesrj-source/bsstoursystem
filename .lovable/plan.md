## Plano: enriquecer fornecedores cadastrados

3 etapas, executadas em sequência. Cada uma é independente — se algo falhar parcialmente, as demais não são afetadas.

---

### 1. Storage: subir tarifários originais

**Migration:** criar bucket privado `supplier-docs` + RLS (read/write para autenticados, delete admin/operacional).

**Nova tabela `supplier_documents`:**
- `id`, `supplier_id` (uuid), `storage_path` (text), `original_filename`, `file_format`, `file_size_bytes`, `language` (pt/en/es/ru/fr), `year` (2026), `kind` ('tarifario'|'descritivo'|'foto'), `uploaded_by`, `created_at`
- RLS análogo ao bucket

**Script de upload** (`/tmp/forn/upload_docs.ts` via bun + service role):
- Percorre `/tmp/forn/FORNECEDORES/2026/**/*` (PDF/XLSX/XLS/PNG/JPG/DOCX)
- Mapeia cada arquivo ao `supplier_id` correto via heurística (path contém token presente em `notes` do supplier — ex.: `RIO DE JANEIRO/HELISIGHT` → supplier "Helisight")
- Faz upload para `supplier-docs/{supplier_code}/{filename}` e cria linha em `supplier_documents`
- Detecta idioma pelo nome (RUSSIAN/ENGLISH/PORTUGU…)
- Pula se já existe (`storage_path` único)

Estimado: ~70 arquivos.

---

### 2. Contatos via IA (Lovable AI)

**Edge function `extract-supplier-contacts`** (verify_jwt=false, chamada via UI button):
- Para cada `supplier_documents` PDF/DOCX do supplier, baixa do storage
- Envia conteúdo (extraído com `pdf-parse` simples / texto bruto) para `google/gemini-2.5-flash` via Lovable AI Gateway pedindo JSON: `{name, role, email, phone, whatsapp, website}[]`
- Insere resultados em `supplier_contacts` (dedup por email/phone+supplier_id)
- Atualiza `suppliers.email`/`phone`/`website` se vazios e houver contato primário detectado
- Loga em `activity_log`

**UI:** na página `/suppliers`, botão "Extrair contatos com IA" (admin/op) que dispara a function via `supabase.functions.invoke` e mostra progresso (toast).

---

### 3. Tarifas detalhadas

**Nova tabela `supplier_rates`:**
- `id`, `supplier_id`, `document_id` (FK lógico para supplier_documents), `service_name` (text), `service_type` (transfer|tour|hotel|restaurant|outro), `city`, `category` (privativo|regular|vip|standard), `language` (guia)
- `pax_min`, `pax_max` (faixa de pax)
- `unit_price` (numeric), `currency`, `unit` (per_person|per_group|per_vehicle|per_night)
- `valid_from`, `valid_until` (date)
- `raw_excerpt` (text — trecho original p/ auditoria)
- `created_at`, `created_by`
- RLS: leitura autenticada; escrita owner/admin/op

**Edge function `extract-supplier-rates`**:
- Para cada documento de tarifário (PDF/XLSX), extrai texto/células
- Envia em chunks para `google/gemini-2.5-pro` (melhor para tabelas) com schema JSON estrito
- Insere em `supplier_rates` em batches de 100, ligando ao supplier+document
- Marca `supplier_documents.processed_at` para evitar reprocessar

**UI:** botão "Importar tarifas com IA" por fornecedor + tab "Tarifas" mostrando `supplier_rates` em tabela com filtros (cidade, tipo, faixa pax).

---

### Ordem de execução
1. Migration (bucket + 2 tabelas + RLS)
2. Script de upload de arquivos (etapa 1)
3. Edge function de contatos + UI button (etapa 2)
4. Edge function de tarifas + UI tab (etapa 3)

### Riscos / observações
- Heurística de mapeamento path→supplier pode falhar em 2-3 nomes; vou logar não-mapeados num CSV para revisão manual
- IA pode alucinar preços; o `raw_excerpt` permite auditoria
- Custo Lovable AI: ~70 docs × ~3k tokens = baixo (Flash para contatos, Pro só para tarifas tabulares)
- Não vou criar contatos manualmente sem fonte — apenas o que a IA conseguir extrair dos PDFs

Posso aprovar e prosseguir?
