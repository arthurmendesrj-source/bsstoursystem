

# Duas funções de IA na Proposta

Adicionar dois recursos de IA no **ProposalEditor**:

1. **Ditar itens por voz** — botão de microfone que grava áudio, transcreve com IA e pré-preenche linhas de Hotel/Service.
2. **Gerar documento da proposta (`.docx`)** — botão que gera um documento comercial no estilo dos exemplos enviados (capa + tabela de preços + roteiro dia-a-dia + inclusões/exclusões), com escolha de modo de preço, idioma e tom.

## 1. Ditar itens (voz → linhas)

**Fluxo:**
- Botão 🎙 "Ditar itens" no header do editor.
- `MediaRecorder` do navegador grava (webm/opus) até o usuário parar.
- Áudio enviado em base64 para edge function `transcribe-proposal-items`.
- Edge function chama Lovable AI (`google/gemini-2.5-pro`, multimodal — aceita áudio inline) com **tool calling estruturado** que retorna:
  ```json
  { "items": [
    { "kind": "hotel", "description": "Hotel Copacabana Palace 5*",
      "city": "Rio", "check_in": "2026-02-12", "check_out": "2026-02-15",
      "rooms": 2, "unit_cost": 250, "markup_pct": 20 },
    { "kind": "service", "description": "City Tour + Cristo Redentor",
      "item_date": "2026-02-13", "quantity": 4, "unit_cost": 80, "markup_pct": 20 }
  ]}
  ```
- Frontend acrescenta cada item à lista (não substitui), aplicando `default_markup_pct` quando ausente. Usuário revisa antes de salvar.
- Idioma da fala detectado automaticamente (PT/EN/ES/RU).
- Erros 402 (créditos) e 429 (rate limit) viram toasts amigáveis.

## 2. Gerar documento da proposta (`.docx`)

**Disparo:** botão 📄 "Gerar Documento" abre diálogo com:
- **Modo de preço:** Valor final único · Detalhado por item · Tabela por categoria de hotel
- **Idioma:** PT · EN · ES · RU
- **Incluir programa descritivo dia-a-dia:** ☑ (default ligado)
- **Tom:** Formal · Inspiracional (default Inspiracional)

**Pipeline:**
1. Frontend envia para edge function `generate-proposal-doc`: dados do quote (itens com datas, custos, markup, totais), lead/customer, preferências.
2. Edge function chama Lovable AI (`google/gemini-2.5-pro`) com **tool calling** para retornar conteúdo estruturado:
   - `title`, `subtitle` (ex.: "Carnival in Rio de Janeiro 2026 — 5d/4n")
   - `intro` (boas-vindas no estilo dos exemplos)
   - `days[]`: `{ day_number, city, title, narrative, services[] }` derivado das datas das linhas
   - `inclusions[]`, `exclusions[]`, `notes[]`
3. Edge function monta o `.docx` com a biblioteca **`docx`** (pure-JS, compatível com Worker SSR) — layout fiel aos exemplos:
   - Página 1: Título + subtítulo + tabela de preços (formato escolhido)
   - Páginas seguintes: "Day N | Cidade" + parágrafo descritivo + serviços do dia
   - Final: "The price includes / does not include" + notas
4. Documento retornado como base64 → frontend força download e salva registro em `quote_documents`.

**Modos de preço:**
- *Valor final*: única linha "Total: USD X".
- *Detalhado por item*: tabela com cada hotel/serviço, datas, qty, subtotal — usando `unit_price` (já com markup).
- *Tabela por categoria*: agrupa hotéis 4★/5★ em colunas SGL/DBL/TRP usando `category` de `quote_items`; cai para "Detalhado" se não houver categorias.

Markup interno **nunca** aparece no documento — apenas `unit_price` final.

## Backend / Banco

**Nova tabela `quote_documents`:**
- `id`, `quote_id` (FK), `created_at`, `created_by`
- `format` ('docx'), `price_mode` ('final'|'detailed'|'category_table')
- `language` ('pt'|'en'|'es'|'ru'), `tone`, `storage_path`
- RLS: usuários autenticados leem; criador/admin gerencia.

**Novo bucket privado `proposal-docs`** com policies para download via signed URL (1h).

**Duas edge functions novas** (ambas usam `LOVABLE_API_KEY`, `verify_jwt = true`, tratam 402/429 e CORS):
- `supabase/functions/transcribe-proposal-items/index.ts`
- `supabase/functions/generate-proposal-doc/index.ts`

## Frontend

**Editar `src/components/proposal/ProposalEditor.tsx`:**
- Botão "🎙 Ditar itens" (painel inline com Stop/Cancelar + indicador de transcrição).
- Botão "📄 Gerar Documento" (abre `GenerateDocDialog`).
- Botões só em `mode === "proposal"`.

**Novos componentes:**
- `src/components/proposal/DictateItemsPanel.tsx` — gravação + chamada à edge function + preview dos itens transcritos.
- `src/components/proposal/GenerateDocDialog.tsx` — diálogo com escolhas + botão "Gerar e baixar" (idiomas: PT/EN/ES/RU já incluídos).
- `src/components/proposal/ProposalDocumentsList.tsx` — lista documentos gerados com link de download.

**i18n** (`src/lib/i18n.tsx`): novas chaves PT/EN/ES — `dictateItems`, `recording`, `stopRecording`, `transcribing`, `generateDocument`, `priceMode`, `priceModeFinal`, `priceModeDetailed`, `priceModeCategory`, `includeItinerary`, `tone`, `formal`, `inspirational`, `documentGenerated`, `previousDocuments`. (`languageRussian` já existe.)

## Privacidade / Segurança

- Áudio enviado direto à edge function, não armazenado.
- `.docx` em bucket privado, signed URL de 1h.
- Documento omite custos e markup; apenas preço final ao cliente.

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Migration | `supabase/migrations/<ts>_quote_documents.sql` (+ bucket + policies) |
| Criar | `supabase/functions/transcribe-proposal-items/index.ts` |
| Criar | `supabase/functions/generate-proposal-doc/index.ts` |
| Criar | `src/components/proposal/DictateItemsPanel.tsx` |
| Criar | `src/components/proposal/GenerateDocDialog.tsx` |
| Criar | `src/components/proposal/ProposalDocumentsList.tsx` |
| Editar | `src/components/proposal/ProposalEditor.tsx` |
| Editar | `src/lib/i18n.tsx` |

## Fora de escopo

- Versão PDF (hoje só `.docx`).
- Imagens automáticas das cidades no documento.
- Editor visual do programa descritivo antes de exportar.
- Re-gerar documento mantendo edições manuais.

