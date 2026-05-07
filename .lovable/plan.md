
## Objetivo

1. Quando a IA gera o programa, já trazer **datas concretas** (check-in/check-out de hotéis, datas de voos e horários por serviço) — derivadas do período do lead/quote.
2. Renomear o botão **"Gerar .docx"** para **"Gerar Proposta Executiva"** e abrir um dialog com novas opções:
   - Modo de preço: **Valor por item** (item a item + total) ou **Valor total** (somente total).
   - Formato: **DOCX** ou **PDF**.
   - Inclui descritivo curto dos produtos vendidos + cronograma com horários.

## 1. Datas e horários no Programa IA

**`supabase/functions/propose-tour-program/index.ts`**
- Carregar `lead.travel_start_date`/`travel_end_date` (ou `quote.valid_until`/datas dos itens existentes) e injetar no prompt como **âncora obrigatória**.
- Atualizar o JSON Schema da tool `update_program`:
  - `days[].date` → obrigatório (ISO `YYYY-MM-DD`).
  - `days[].schedule[]` (novo): `[{ time: "HH:MM", title, description, kind: "transfer|tour|meal|free|hotel" }]`.
  - `hotels[].check_in` / `check_out` → obrigatórios + `check_in_time` (default 15:00) e `check_out_time` (default 11:00).
  - `flights[].date` + `departure_time` / `arrival_time`.
  - `services[].date` + `start_time` / `end_time`.
- Regra no system prompt: "Distribua as datas em sequência a partir de `travel_start_date`; check-out de um hotel = check-in do próximo; respeite duração total".

**`src/lib/applyProgramToQuote.ts`**
- Gravar `item_date` = check-in / data do voo / data do serviço; `check_out` = check-out do hotel.
- Concatenar horários no `notes` ("Check-in 15:00 · Check-out 11:00", "Saída 09:00 — Retorno 17:00").

**`src/components/proposal/AiProgramAssistantDialog.tsx`**
- Mostrar datas e horários no preview (já renderiza `d.date` — adicionar `schedule[]`, hotel `check_in/out + horários`, flight horários).

## 2. Renomear botão e novo dialog "Proposta Executiva"

**`src/components/proposal/ProposalEditor.tsx`**
- Trocar label do botão atual `genOpen` (`GenerateDocDialog`) por **"Gerar Proposta Executiva"** + ícone `FileCheck`.

**Substituir `GenerateDocDialog.tsx` por `ExecutiveProposalDialog.tsx`** (mantém props: `quoteId`, `open`, `onOpenChange`, `onGenerated`):

Campos no dialog:
- **Modo de preço** (radio): `Valor por item` (default) | `Valor total`.
- **Formato** (radio): `DOCX` (default) | `PDF`.
- **Idioma**, **Tom**, **Briefing curto** (mantidos, mais compactos).
- Toggle "Incluir cronograma detalhado" (default on).

Botão "Gerar Proposta Executiva" → invoca `generate-proposal-doc` com `price_mode: "detailed" | "final"` e novo parâmetro `format: "docx" | "pdf"`.

## 3. Backend — DOCX e PDF + Descritivo + Cronograma

**`supabase/functions/generate-proposal-doc/index.ts`**

Adições:
- Novo parâmetro `format: "docx" | "pdf"` no body (default `docx`).
- Nova seção no DOCX **antes da tabela de preços**: **"Descritivo Executivo"** — parágrafo curto (gerado pela IA, novo campo `executive_summary` na tool `build_proposal_content`) listando hotéis (cidade + categoria + noites), voos, principais tours.
- **Cronograma consolidado**: tabela única `Data | Hora | Atividade | Local` montada a partir de `quote_items` (data, descrição, horários do `notes`) + `quote_flights`. Renderizada sempre, mesmo no modo `final`.
- **`price_mode: "final"`** já existe — mantém só uma linha "Total". O modo `detailed` mostra item a item + total (já implementado).
- **Geração de PDF** (quando `format === "pdf"`):
  - Estratégia: gerar o `.docx` primeiro (mesmo conteúdo), depois converter para PDF usando **`docx-pdf` via REST?** Não há LibreOffice em Edge Functions.
  - Decisão: usar **`pdf-lib` + `@pdfme/generator`?** Mais simples: re-renderizar o conteúdo direto em PDF com **`pdfkit`** (esm.sh) — duplica o builder.
  - **Abordagem escolhida**: criar helper `buildContent(content, items, ...)` retornando uma estrutura intermediária (lista de blocos: heading, paragraph, table, bullet, pageBreak); dois renderers — `renderDocx(blocks)` (já existe) e novo `renderPdf(blocks)` usando **`pdf-lib`** (fontes Helvetica nativas, sem dependências binárias). Salva em storage com extensão correta e MIME `application/pdf`.

**`quote_documents`** — campo `format` já é texto; aceita `"pdf"`. Sem migração.

## 4. Detalhes técnicos

```text
ExecutiveProposalDialog
  ├── price_mode: "detailed" | "final"
  ├── format:     "docx" | "pdf"
  └── invoke('generate-proposal-doc', { quote_id, price_mode, format, language, tone, briefing, include_itinerary:true, include_schedule:true })

generate-proposal-doc
  ├── AI tool agora retorna: executive_summary (string curta) + days[].schedule[] (já existe)
  ├── buildBlocks(content, items, flights, totals) → Block[]
  ├── if format=docx → renderDocx(blocks) → upload .docx
  └── if format=pdf  → renderPdf(blocks)  → upload .pdf
```

## Arquivos

**Criar**
- `src/components/proposal/ExecutiveProposalDialog.tsx`
- `supabase/functions/generate-proposal-doc/render-pdf.ts` (helper `pdf-lib`)
- `supabase/functions/generate-proposal-doc/blocks.ts` (estrutura intermediária + builder)

**Editar**
- `supabase/functions/propose-tour-program/index.ts` — schema com datas/horários + prompt
- `src/lib/applyProgramToQuote.ts` — persistir horários
- `src/components/proposal/AiProgramAssistantDialog.tsx` — exibir horários
- `src/components/proposal/ProposalEditor.tsx` — trocar `GenerateDocDialog` por `ExecutiveProposalDialog` + relabel
- `supabase/functions/generate-proposal-doc/index.ts` — refactor para usar blocks + suportar `format: pdf` + descritivo executivo + cronograma consolidado
- `src/lib/i18n.tsx` — chave `generateExecutiveProposal`

**Remover (após migração)**: `GenerateDocDialog.tsx`

## Pontos a confirmar

1. **Datas do lead**: posso usar `lead.travel_start_date` e `travel_end_date` como âncora? Se o lead não tiver, perguntar à IA estimar a partir do número de noites/dias?
2. **Horários default**: check-in 15:00 / check-out 11:00 / tours 09:00 — OK?
3. **PDF**: tudo bem usar layout simples (Helvetica, sem cores de marca) para o PDF na primeira versão? Posso depois evoluir para visual mais elaborado.
