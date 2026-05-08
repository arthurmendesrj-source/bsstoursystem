## Causa do erro "upstream request timeout"

A função `gmailFullSync` (server function) e o `runFullSyncRound` no endpoint público `/api/public/gmail-poll` processam **500 mensagens por invocação**, buscando cada mensagem completa pelo connector gateway com concorrência 5 (≈100 rodadas sequenciais por chamada). Isso ultrapassa o limite de tempo do Worker que executa as server functions, resultando em **upstream request timeout** (gateway corta a conexão antes da função terminar).

O sync já é resumível (salva `full_sync_page_token` + `full_sync_current_label`), só está pedindo demais por chamada.

## Correção

**1. `src/server/gmail-mirror.functions.ts` — `gmailFullSync`**
- Reduzir `maxResults` de `500` → `75` por chamada.
- Aumentar `CONCURRENCY` de `5` → `8` para não perder muito throughput.
- O cliente já faz loop até `done: true`, então só serão mais iterações curtas (cada uma terminando bem antes do timeout).

**2. `src/routes/api/public/gmail-poll.ts` — `runFullSyncRound`**
- Mesma redução: `maxResults` `500` → `75`.
- Esse endpoint é chamado pelo cron por owner; uma rodada curta evita estourar o timeout do Worker no cron também.

**3. `src/components/email/EmailPanel.tsx` — `doFullSync`**
- Aumentar o teto de iterações de `400` → `2000` (cada chamada agora cobre menos mensagens, então precisa de mais loops para cobrir 6 meses × 7 labels).
- Adicionar um pequeno `await new Promise(r => setTimeout(r, 150))` entre chamadas para não saturar o Worker.

**4. Sem alterações de schema, RLS, autenticação, busca de email, UI ou compose.** Apenas o tamanho da página por invocação é alterado — o algoritmo de sync (labels sequenciais, janela de 180 dias, retomada via `full_sync_page_token`/`full_sync_current_label`) permanece igual.

## Resultado esperado

- Cada invocação do full sync termina em poucos segundos (em vez de >100s) → sem mais "upstream request timeout".
- O sync completo das pastas (INBOX, SENT, DRAFT, SPAM, TRASH, IMPORTANT, STARRED, últimos 6 meses) continua acontecendo, só que dividido em mais chamadas curtas.
- O sync incremental (history) e o cron continuam funcionando normalmente.
