## Objetivo

Ajustar a edge function `generate-proposal-doc` para:

1. **Não inventar atividades em dias livres**: o roteiro/cronograma deve mencionar apenas datas em que existem itens preenchidos (hotel check-in/out, serviço com data, ou voo). Dias intermediários sem itens são totalmente omitidos.
2. **Nome do programa baseado em países-destino dos voos**, excluindo o país de origem (ex.: "Argentina & Chile").

---

## 1. Restringir o roteiro aos itens preenchidos

Em `supabase/functions/generate-proposal-doc/index.ts`:

### Pré-cálculo (antes da chamada à IA)

- Carregar `quote_flights` antes do prompt (hoje só são carregados depois, dentro do bloco de cronograma). Mover esse fetch para junto do `quote_items`.
- Construir `activeDates: Set<string>` reunindo:
  - `item_date` e `check_out` de cada hotel,
  - `item_date` de cada serviço,
  - `flight_date` de cada voo.
- Construir `dayBriefs: { date, items: [{ kind, description, city, time? }] }[]` agrupando todos os itens por data para passar à IA.

### Prompt da IA

- Adicionar ao `userBrief`:
  - `active_dates`: array ordenado das datas com itens.
  - `day_briefs`: array agrupado por data (kind + description + city).
- Reforçar no system prompt:
  - "Generate days ONLY for the dates listed in `active_dates`. Do NOT invent free days, rest days, or filler activities for any other date."
  - "Each generated day's `schedule`, `transfers`, `meals_included`, `highlights` and `tips` must reference ONLY the items provided in `day_briefs[date]`. Do not add extra tours, sightseeing or meals that were not quoted."
  - "Hotel-only days (apenas check-in ou check-out, sem serviço/voo) devem ter narrativa curta focada em chegada/saída — sem horário de tour."
- Atualizar a instrução do tool `build_proposal_content`: campo `days[].day_number` agora corresponde à posição cronológica dentro de `active_dates` (1, 2, 3...), não ao "dia da viagem" calendário absoluto.

### Pós-processamento defensivo

Após receber `content.days` da IA, filtrar:
```ts
content.days = (content.days ?? []).filter(d => activeDates.has(String(d.date)));
```
Garante a omissão mesmo se a IA escorregar.

### Cronograma consolidado

O bloco de cronograma já é montado a partir de itens reais (`items + flightsRaw`), então naturalmente ignora dias sem dados. Não precisa mudar.

## 2. Título do programa pelos países-destino dos voos

### Mapeamento IATA → país

Adicionar arquivo `supabase/functions/generate-proposal-doc/iata-countries.ts` com um dicionário compacto dos códigos IATA mais relevantes para a operação atual (Brasil + América do Sul + principais hubs internacionais que aparecem nas propostas). Estrutura:

```ts
export const IATA_COUNTRY: Record<string, string> = {
  GIG: "Brasil", GRU: "Brasil", CGH: "Brasil", BSB: "Brasil", SSA: "Brasil",
  EZE: "Argentina", AEP: "Argentina", BRC: "Argentina",
  SCL: "Chile", IPC: "Chile",
  LIM: "Peru", CUZ: "Peru",
  MVD: "Uruguai", PUJ: "República Dominicana",
  MIA: "EUA", JFK: "EUA", LAX: "EUA",
  LIS: "Portugal", MAD: "Espanha", CDG: "França", FCO: "Itália", LHR: "Reino Unido",
  // ... lista inicial de ~80 códigos cobrindo destinos comuns
};
```

Códigos não mapeados são ignorados (não derrubam o título; caem no fallback abaixo).

### Cálculo do título

Após carregar voos, antes do prompt:

```ts
const originCode = flightsRaw[0]?.from_code;
const originCountry = originCode ? IATA_COUNTRY[originCode] : undefined;
const destinationCountries = Array.from(new Set(
  (flightsRaw ?? [])
    .map(f => IATA_COUNTRY[f.to_code])
    .filter((c): c is string => !!c && c !== originCountry)
));
```

Formatação:
- 0 países → fallback (lead.destination ou título atual da IA).
- 1 país → `"Brasil"`.
- 2 países → `"Argentina & Chile"`.
- 3+ → `"Argentina, Chile & Peru"` (vírgula nos primeiros, `&` antes do último).

Passar ao IA como `program_title` no `userBrief` E sobrescrever o `content.title` pós-resposta com esse valor quando houver pelo menos um país-destino. Assim o nome aparece na capa, no `safeTitle` do arquivo e no registro `quote_documents.title`.

### Casos de borda

- Sem voos → mantém comportamento atual (`lead.destination` ou título da IA).
- Voo único cujo destino é o mesmo país de origem (voo doméstico) → título cai no fallback.
- Códigos IATA desconhecidos → contribuir com um TODO interno (log) para enriquecer o dicionário no futuro.

## 3. Detalhes técnicos

- Re-ordenar o fetch de `quote_flights` para ANTES da chamada à IA; o bloco que monta o cronograma reaproveita o mesmo `flightsRaw` (remove o fetch duplicado).
- Tipar `flightsRaw` localmente para evitar `any` no novo código.
- Não há mudança de schema de banco.
- Não há mudança no frontend (o título exibido vem do retorno da função).

## Fora do escopo

- Tradução do título para os 4 idiomas (mantém em PT por enquanto).
- Mapeamento IATA completo (parte de outro turno se aparecerem códigos novos).
- Geocoding de cidades para inferir país sem voos (não solicitado).
