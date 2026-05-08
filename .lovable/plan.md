## Objetivo

Refazer a sincronização completa percorrendo **pasta por pasta × mês a mês** dos últimos 12 meses, com janelas pequenas para evitar `upstream request timeout` no gateway do Gmail.

## Estratégia

Hoje, cada chamada de `gmailFullSync` lista uma página de até 75 mensagens dentro de uma janela única (ex.: `newer_than:180d`). Para janelas grandes, o `messages.list` + leitura dos detalhes em lote estoura o tempo do gateway.

Mudaremos para um **cursor de duas dimensões**: `(label, monthOffset, pageToken)`. A cada chamada o servidor:

1. Lê `current_label` + `current_month_offset` + `page_token` do `email_sync_state`.
2. Monta a query Gmail `after:YYYY/MM/DD before:YYYY/MM/DD` para a fatia de 30 dias correspondente (ex.: `monthOffset=0` → últimos 30d; `=1` → 30–60d atrás; … até `=11`).
3. Lista 1 página (mantém `maxResults=50` — reduzir um pouco para folga) e processa.
4. Decide o próximo passo:
   - se há `nextPageToken` → mesma `(label, month)`;
   - se acabaram as páginas e `month < 11` → próximo mês na mesma pasta;
   - se acabou os 12 meses → próxima pasta, `month=0`;
   - se acabou tudo → `done=true`.

Assim cada invocação processa no máximo ~50 mensagens de **uma única fatia mensal**, eliminando o timeout, e percorre exatamente: INBOX × 12 meses, depois SENT × 12 meses, e assim por diante (`SENT`, `DRAFT`, `SPAM`, `TRASH`, `IMPORTANT`, `STARRED`).

## Mudanças

### 1. Banco — `email_sync_state`

Adicionar colunas via migration:
- `full_sync_current_month_offset int not null default 0`
- `full_sync_window_days int` (passa a guardar janela total — para este caso, 360)

### 2. Servidor — `src/server/gmail-mirror.functions.ts`

Em `gmailFullSync`:
- Aceitar `windowDays` (default 360) e usar para calcular `totalMonths = ceil(windowDays/30)`.
- Substituir `q=newer_than:Xd` por `q=after:YYYY/MM/DD before:YYYY/MM/DD` calculado a partir de `monthOffset`.
- Reduzir `maxResults` de 75 → 50 e `CONCURRENCY` de 8 → 5 (mais folga no gateway).
- Persistir `full_sync_current_month_offset` no `upsert`.
- Retornar `monthOffset`, `monthLabel` (ex.: "out/2025"), `totalMonths` para a UI.

### 3. UI — `src/components/email/EmailPanel.tsx`

- Fixar a sincronização do botão "Sincronizar tudo (12 meses)" em `windowDays=360`. Manter o seletor existente para o usuário poder escolher outro período.
- Mostrar no painel de progresso o mês atual da pasta ativa (ex.: `INBOX — out/2025 (3 de 12)`).
- Mensagem final: "Sincronização concluída — 12 meses de INBOX, SENT, DRAFT, SPAM, TRASH, IMPORTANT, STARRED."
- Em caso de erro de timeout pontual, fazer **retry automático** da mesma chamada até 3 vezes com backoff (1s/3s/6s) antes de abortar.

### 4. Tratamento de timeout

No helper `gw()` server-side: se o gateway responder 504/timeout, lançar erro tipado; o loop da UI captura, espera 2s e reenvia o **mesmo** estado (graças à persistência de `month_offset` + `page_token`, a sincronização retoma exatamente do ponto que falhou).

## Fora de escopo

- Alterar `email_threads` ou a leitura de Enviados (já corrigido).
- Sincronização incremental (`gmailIncrementalSync`) — continua igual.
- Janelas além de 12 meses.
