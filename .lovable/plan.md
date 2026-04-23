

# Adicionar datas em itens da proposta

Adicionar campos de **data** nos itens da proposta para registrar quando cada serviço/diária acontece, igual ao Excel base (colunas Date / Check-out em Hotels, Date em Services).

## Como vai funcionar

**Hotels** (cada linha vira uma estadia com período):
- Coluna **Check-in** (data) e **Check-out** (data)
- Campo `nights` é calculado automaticamente a partir das duas datas (mas continua editável caso o usuário queira sobrescrever)

**Services** (cada linha tem a data do serviço):
- Coluna **Data** (data única)

Datas são opcionais (linhas antigas continuam funcionando), mas ao preencher aparecem formatadas em PT-BR (`dd/MM/yyyy`) tanto no editor quanto na visão Invoice.

No modo **Invoice** (read-only), as datas viram parte do layout final, espelhando o Excel:
```text
Check-in   Check-out  Hotel               City   USD   Rms  N  Subtotal
12/02/26   15/02/26   Hotel Copacabana    RIO    250   2    3  $1,500
```

## Mudanças no banco

Migration adicionando 3 colunas em `quote_items`:
- `item_date date` — usada para Services (data única) e como Check-in para Hotels
- `check_out date` — usada apenas em Hotels
- (a coluna `nights` que será adicionada agora se ainda não existir; senão, mantida)

Como hoje a tabela `quote_items` não tem campos estruturados de hotel/serviço (só `description`, `quantity`, `unit_cost`, `markup_pct`), aproveito a migration para também garantir os campos que faltam para o layout: `kind` ('hotel'|'service'), `city`, `category`, `meal_plan`, `rooms`, `nights`, `pax`, `ways`. Isso destrava o layout completo do Excel sem nova migration depois.

## Componentes

- **`src/components/proposal/ProposalEditor.tsx`** — adicionar:
  - Em linhas Hotel: 2 inputs `type="date"` (Check-in, Check-out) + auto-cálculo de `nights = diffDays(checkOut, checkIn)` quando ambas preenchidas; usuário ainda pode editar `nights` manualmente.
  - Em linhas Service: 1 input `type="date"` (Data).
  - Persistir `item_date` / `check_out` no upsert de `quote_items`.
  - Modo `invoice`: exibir datas formatadas (date-fns `format(d, "dd/MM/yyyy")`).
- **`src/lib/proposal-totals.ts`** — pequeno helper `diffNights(checkIn, checkOut)` para o auto-cálculo.

## i18n

Novas chaves PT/EN/ES em `src/lib/i18n.tsx`: `checkIn`, `checkOut`, `serviceDate`, `nightsAuto`.

## Arquivos afetados

| Ação | Arquivo |
|---|---|
| Migration | `supabase/migrations/<timestamp>_quote_items_dates.sql` |
| Editar | `src/components/proposal/ProposalEditor.tsx` |
| Editar | `src/lib/proposal-totals.ts` |
| Editar | `src/lib/i18n.tsx` |

## Fora de escopo (próximo passo, se quiser)

- Validar que `check_out > check_in` com mensagem de erro inline.
- Ordenar linhas da proposta automaticamente por data.

