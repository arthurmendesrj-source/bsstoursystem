## Objetivo

Renomear o botão **"Gerar Proposta Executiva"** para **"Gerar Documento"** e expandir o dialog para oferecer **3 tipos de saída**:

1. **Proposta Executiva** — documento comercial atual (descritivo executivo + tabela de preços + cronograma).
2. **Programa Turístico** — documento promocional/informativo das cidades e itens em cotação, no formato de apresentação de pacote turístico (sem foco em preço).
3. **Proposta Executiva + Programa Turístico** — combinação dos dois em um único arquivo (Programa primeiro como apresentação, depois a Proposta Executiva).

## 1. UI — `ExecutiveProposalDialog.tsx` → `GenerateDocumentDialog.tsx`

Renomear arquivo e componente. Manter assinatura (`quoteId`, `open`, `onOpenChange`, `onGenerated`).

Novo campo no topo do dialog (radio cards, default `executive`):

```
○ Proposta Executiva       — documento comercial com preços e cronograma
○ Programa Turístico       — apresentação promocional das cidades e itens
○ Proposta + Programa      — um arquivo único combinando ambos
```

Comportamento dos demais campos conforme a escolha:

- **Proposta Executiva**: mostra todos os campos atuais (modo de preço, formato, idioma, tom, toggles de roteiro/cronograma, briefing).
- **Programa Turístico**: oculta `price_mode` e o toggle "cronograma consolidado". Mantém formato, idioma, tom, briefing e o toggle "incluir roteiro dia a dia". Adiciona toggle **"Incluir destaques das cidades"** (default on) e **"Incluir descrição dos hotéis e serviços"** (default on).
- **Proposta + Programa**: mostra a união dos campos (price_mode aplicado apenas à parte da proposta).

Botão de ação muda o label conforme o tipo selecionado: "Gerar Proposta Executiva" / "Gerar Programa Turístico" / "Gerar Documento Completo".

## 2. `ProposalEditor.tsx`

Trocar:
- Label `Gerar Proposta Executiva` → `Gerar Documento`
- Ícone `FileCheck` → `FileText` (ou manter `FileCheck`)
- Import: `ExecutiveProposalDialog` → `GenerateDocumentDialog`

## 3. Backend — `supabase/functions/generate-proposal-doc/index.ts`

Aceitar novo parâmetro `doc_type: "executive" | "tour_program" | "combined"` (default `executive`). Mantém `format`, `price_mode`, `language`, `tone`, `briefing`, toggles existentes + novos:
- `include_city_highlights` (boolean)
- `include_item_descriptions` (boolean)

### Mudanças no prompt da IA (tool `build_proposal_content`)

Adicionar novos campos no schema:
- `tour_program`: objeto com:
  - `intro`: parágrafo de abertura promocional do pacote (3-5 frases).
  - `cities[]`: `{ name, country?, highlights: string[], short_description }` para cada cidade do roteiro.
  - `inclusions_narrative`: texto descritivo (não-tabular) apresentando hotéis ("hospedagem em hotel 5★ no centro histórico…"), voos e serviços de forma promocional.
  - `closing`: chamada final inspiracional.

A IA deve gerar `tour_program` quando `doc_type` for `tour_program` ou `combined`, e `executive_summary` quando for `executive` ou `combined`.

### Builder de blocos

Novo módulo lógico `buildTourProgramBlocks(content, items, flights, lead)`:
- Capa/título: "Programa Turístico — {destino}"
- Intro promocional
- Para cada cidade: nome como heading, descrição curta, lista de destaques
- Roteiro dia a dia (reaproveita a lógica existente de `days[]` com `schedule[]` e datas)
- Narrativa de inclusões (hotéis com check-in/out, voos, principais serviços) — **sem coluna de preço**
- Fechamento

Função `buildExecutiveBlocks(...)` (refactor do que já existe): descritivo executivo + tabela de preços (respeitando `price_mode`) + cronograma consolidado.

Roteamento por `doc_type`:
- `executive` → `buildExecutiveBlocks(...)`
- `tour_program` → `buildTourProgramBlocks(...)`
- `combined` → `[...buildTourProgramBlocks(...), pageBreak, ...buildExecutiveBlocks(...)]`

Renderização (`renderDocx` / `renderPdf`) e upload para storage permanecem iguais. Nome do arquivo derivado do `doc_type`:
- `proposta-executiva-{quote}.{ext}`
- `programa-turistico-{quote}.{ext}`
- `proposta-completa-{quote}.{ext}`

## 4. i18n

Em `src/lib/i18n.tsx`:
- `generateExecutiveProposal` → mantém, agora reusado internamente
- novas: `generateDocument`, `docTypeExecutive`, `docTypeTourProgram`, `docTypeCombined`, `generateTourProgram`, `generateCompleteDocument`, `includeCityHighlights`, `includeItemDescriptions`

## 5. Arquivos

**Renomear/editar**
- `src/components/proposal/ExecutiveProposalDialog.tsx` → `GenerateDocumentDialog.tsx` (novo seletor de tipo + lógica condicional dos campos)
- `src/components/proposal/ProposalEditor.tsx` (label, ícone e import)
- `supabase/functions/generate-proposal-doc/index.ts` (param `doc_type`, novos campos da tool, builder de blocos do programa, roteamento)
- `src/lib/i18n.tsx`

**Sem mudanças no banco** — `quote_documents.format` já aceita pdf/docx; podemos opcionalmente persistir `doc_type` no campo `metadata`/`title` do documento gerado.

## Pontos a confirmar

1. **Programa Turístico — preços**: confirma que NÃO deve aparecer **nenhuma** referência a valores no Programa Turístico (nem total)? (Seguirei como sem preços por padrão.)
2. **Combinado — ordem**: Programa primeiro e Proposta Executiva depois? Ou inverter?
3. **Imagens das cidades no Programa**: por enquanto **somente texto** (sem buscar/gerar imagens) — OK manter assim nesta primeira versão e evoluir depois?
