# Assistente de IA na aba Proposta

Substituir o botão **Gerar Documento** (atual `GenerateDocDialog`) por um **Assistente de IA de Programa Turístico** integrado ao editor de propostas. Ele lê todo o contexto do lead, propõe um programa completo e permite refinar via chat antes de aplicar à proposta.

## 1. Novo componente: `AiProgramAssistantDialog.tsx`

Substitui o atual dialog. Layout em 2 colunas (desktop) / abas (mobile):

**Esquerda — Contexto coletado (read-only, editável)**
- Lead: nome, destino(s), datas, pax (adultos/crianças), orçamento, idioma, perfil (lua de mel/família/luxo/corporativo).
- Últimas interações + e-mails (`interactions`, `gmail_messages` se existir) — últimos 20 itens resumidos pela IA.
- Itens já adicionados na cotação atual.
- Toggle "incluir e-mails", "incluir histórico", "incluir itinerários internos (RAG)".

**Direita — Chat com a IA**
- Mensagem inicial automática: a IA gera um **Programa Turístico** com:
  - Cronograma dia a dia (manhã/tarde/noite) com cidade.
  - Lista de **hotéis** sugeridos (categoria, noites, observações).
  - Lista de **voos** (trechos, classe sugerida).
  - **Serviços/tours/transfers** por dia.
  - **Resumo executivo** + observações.
- Caixa de input para o usuário pedir alterações ("trocar hotel para 5★", "adicionar dia em Florença", "remover passeio X", "reduzir orçamento 15%", "traduzir em russo"…).
- Cada turno da IA devolve o programa atualizado (JSON estruturado) + texto explicativo.
- Botões no rodapé:
  - **Aplicar à proposta** → converte itens estruturados (hotéis/voos/serviços) em `quote_items` usando os dialogs já existentes (`HotelDialog`/`FlightDialog`/`ServiceDialog` reaproveitam preços via supplier_rates / pricing-engine).
  - **Gerar documento .docx** → mantém compatibilidade chamando `generate-proposal-doc` com o briefing consolidado.
  - **Salvar conversa** → grava em `ai_conversations` (`title = "Programa — <lead>"`).

## 2. Edge function: `propose-tour-program`

Nova função em `supabase/functions/propose-tour-program/index.ts`. Streaming SSE.

Entrada:
```ts
{ lead_id, quote_id, messages: [{role,content}], options: { include_emails, include_interactions, include_rag, language, tone } }
```

Pipeline:
1. Carrega lead + cotação atual + interações + e-mails (server-side via service role).
2. RAG opcional: chama `itinerary-search` com destino+perfil para trazer trechos de itinerários históricos.
3. Monta system prompt com role "Arquiteto de Roteiros". Exige resposta em **tool call** `update_program` com schema:
   ```
   { summary, days: [{day,date,city,morning,afternoon,evening}],
     hotels: [{city,name,category,nights,check_in,check_out,notes}],
     flights: [{from,to,date,class,notes}],
     services: [{day,kind,description,supplier_hint,duration}],
     notes, language }
   ```
4. Modelo: `google/gemini-3-flash-preview` (default). Tool calling para garantir JSON estável; texto livre vai como `assistant_message`.
5. Stream do texto + envio do JSON final em evento `program`. Trata 429/402.

## 3. Persistência

- Reaproveitar `ai_conversations` + `ai_messages` (já existem). Adicionar coluna opcional `program_json jsonb` em `ai_messages` para guardar a versão do programa de cada turno (migration pequena).
- Sem novas tabelas além disso.

## 4. Aplicação à proposta

Função `applyProgramToQuote(program, quoteId)`:
- Para cada `hotel` → cria `quote_items` tipo hotel (qtd = noites × quartos), tentando casar com `supplier_rates` via slug de cidade/categoria; se não achar, cria com custo 0 + flag "preencher".
- Idem para `flights` (kind=flight) e `services`.
- Aplica markup default via `pricing-engine` (`priceItem`).
- Mostra resumo: "X hotéis, Y voos, Z serviços adicionados — N itens precisam de custo".

## 5. ProposalEditor

- Remover botão "Gerar Documento" como ação principal; vira item secundário dentro do assistente.
- Novo botão primário: **🪄 Assistente IA** (ícone `Sparkles`) abre `AiProgramAssistantDialog`.
- Mantém demais botões (Propor Envio, Propor Fatura).

## 6. Arquivos

Criar:
- `src/components/proposal/AiProgramAssistantDialog.tsx`
- `src/lib/applyProgramToQuote.ts`
- `supabase/functions/propose-tour-program/index.ts`

Editar:
- `src/components/proposal/ProposalEditor.tsx` (trocar botão + dialog).
- `src/lib/i18n.tsx` (chaves novas: `aiAssistant`, `aiAssistantTitle`, `applyToProposal`, etc.).

Migration:
- `ALTER TABLE ai_messages ADD COLUMN program_json jsonb;`

Manter `GenerateDocDialog.tsx` como secundário (acessível dentro do assistente) para não quebrar o fluxo .docx.

## Perguntas abertas
1. O assistente deve **substituir** os itens existentes da cotação ao aplicar, ou **adicionar** ao final? (proposta: adicionar; usuário confirma "limpar antes" via checkbox)
2. Idioma da resposta inicial: detectar do lead ou sempre PT-BR? (proposta: usar `lead.language` se existir, senão PT-BR)
