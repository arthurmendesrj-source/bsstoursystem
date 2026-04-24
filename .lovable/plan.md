

# IA como Operadora de Turismo — Itinerário e gestão completa

Reforçar a edge function `generate-proposal-doc` para que a IA atue como uma **operadora de turismo sênior** — não só descrevendo dias, mas entregando um **itinerário completo e gestão da viagem** (logística, transfers, horários, recomendações práticas, contatos úteis, dicas culturais, contingências).

## Mudanças no system prompt + tool schema

Em `supabase/functions/generate-proposal-doc/index.ts`:

**1. Novo system prompt** (persona + escopo):
> "Você é uma operadora de turismo sênior, com 20+ anos montando viagens sob medida na América do Sul. Sua tarefa é entregar não apenas um texto descritivo, mas um **itinerário operacional completo** que cubra logística (transfers, horários sugeridos de check-in/out, deslocamentos entre cidades), experiência (atrações, gastronomia local, dicas culturais), e gestão prática (documentos, moeda, clima na época, vacinas/visto se aplicável, o que levar, contatos de emergência genéricos, política de cancelamento padrão). Tom ${tone}, idioma ${langName}. Nunca cite custos ou markup interno."

**2. Tool `build_proposal_content` ampliada** com novos campos para a operadora:

```ts
days[]: {
  day_number, date, city, title, narrative,
  schedule: [{ time, activity }],          // NOVO — cronograma do dia
  transfers: [string],                      // NOVO — "Aeroporto GIG → Hotel Copacabana, ~45min"
  meals_included: [string],                 // NOVO — café/almoço/jantar
  highlights: [string],                     // NOVO — pontos altos
  tips: [string]                            // NOVO — dicas práticas
}

practical_info: {                           // NOVO bloco — gestão da viagem
  best_time_to_visit, weather, currency,
  language, plug_type, tipping,
  documents: [string],                      // passaporte, visto, vacinas
  what_to_pack: [string],
  health_safety: [string],
  emergency_contacts: [string]              // genéricos: 190 polícia BR, etc.
}

trip_management: {                          // NOVO bloco — operacional
  arrival_instructions: string,             // como será recebido no aeroporto
  checkin_checkout_policy: string,
  transfers_overview: string,
  guide_language: string,
  support_24_7: string,                     // ex: "Coordenador local disponível 24/7 via WhatsApp"
  cancellation_policy: string,
  payment_terms: string
}

inclusions, exclusions, notes  // já existem
```

**3. Renderização no `.docx`** — adicionar seções novas após o itinerário:

- **Cronograma do dia**: para cada dia, se `schedule[]` existe, renderizar tabela compacta `Hora | Atividade` abaixo da narrativa.
- **Transfers / Refeições / Dicas**: blocos curtos rotulados dentro de cada dia.
- **Página "Informações Práticas"** (`practical_info`): seções com clima, moeda, documentos, o que levar, saúde & segurança, contatos de emergência.
- **Página "Gestão da Viagem"** (`trip_management`): instruções de chegada, política de check-in/out, suporte 24/7, política de cancelamento, condições de pagamento.

**4. Labels novos** em `LABELS` (PT/EN/ES/RU) para: `schedule`, `transfers`, `mealsIncluded`, `highlights`, `tips`, `practicalInfo`, `weather`, `currency`, `documents`, `whatToPack`, `healthSafety`, `emergencyContacts`, `tripManagement`, `arrivalInstructions`, `support247`, `cancellationPolicy`, `paymentTerms`.

**5. Modelo**: continuar `google/gemini-2.5-pro` (o tool schema cresce, então precisa do modelo mais robusto). Manter tratamento de 402/429.

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Editar | `supabase/functions/generate-proposal-doc/index.ts` |

## Bônus (também corrige o build atual)

Há um erro de sintaxe ativo em `src/components/proposal/ProposalEditor.tsx` (linha 205, `await` em função não-`async`, e `}` inválido no JSX em 442). Vou corrigir junto — tornar `removeItem` `async` e fechar o JSX corretamente — para o preview voltar a compilar.

| Ação | Arquivo |
|---|---|
| Corrigir | `src/components/proposal/ProposalEditor.tsx` (regressões de build) |

## Fora de escopo

- Buscar dados reais de clima/câmbio em tempo real (a IA usa conhecimento geral).
- Gerar PDF (continua `.docx`).
- Inserir imagens automáticas das cidades.

