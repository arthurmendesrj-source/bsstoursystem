## Problema

A sincronização do Gmail (botão "Sincronizar") usa `/users/me/messages?maxResults=500&includeSpamTrash=true` **sem filtro de tempo nem de label**, paginando do mais novo para o mais antigo. Resultado:

- Em caixas grandes, a sincronização raramente "termina" (200 lotes × 500 = limite do loop), e a aba **Enviados** fica incompleta porque os emails de `SENT` mais antigos chegam no fim da paginação geral e nunca são alcançados.
- A sincronização incremental (`history`) só pega o que mudou depois do `last_history_id` — não corrige o backlog que faltou.
- Não existe nenhum recorte por janela de tempo (ex.: últimos 6 meses) nem garantia de cobertura por pasta.

## Objetivo

Sincronizar **todas as mensagens dos últimos 6 meses** em **cada pasta do sistema** (INBOX, SENT, DRAFT, SPAM, TRASH, IMPORTANT, STARRED), de forma confiável e idempotente.

## Solução

### 1. `src/server/gmail-mirror.functions.ts` — `gmailFullSync`

Trocar a estratégia de "paginação global" por **sincronização por label, com janela de tempo**:

- Adicionar `inputValidator` aceitando:
  - `restart?: boolean`
  - `windowDays?: number` (default `180` ≈ 6 meses)
  - `label?: string` (label atual sendo sincronizado; default `"INBOX"`)
- Manter a ordem fixa de labels: `["INBOX", "SENT", "DRAFT", "SPAM", "TRASH", "IMPORTANT", "STARRED"]`.
- Para cada chamada, montar a query do Gmail:
  ```
  /users/me/messages?maxResults=500
    &labelIds={label}
    &q=newer_than:{windowDays}d
    &includeSpamTrash=true        (apenas para SPAM/TRASH)
    &pageToken={token}
  ```
- Persistir progresso em `email_sync_state` em duas colunas novas (ou reutilizar via JSON):
  - `full_sync_current_label` (text)
  - `full_sync_page_token` (já existe — passa a ser por label)
- Quando `nextPageToken` acabar para o label atual, avançar para o próximo label da lista. Quando todos os labels terminarem, marcar `done: true` e gravar `last_full_sync_at`.
- Retorno: `{ done, label, syncedThisRun, totalSynced, threads, hasMore, nextLabel? }`.

### 2. Migration: `email_sync_state`

Adicionar coluna:
```sql
ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS full_sync_current_label text;
```
Sem mudanças em RLS.

### 3. `src/components/email/EmailPanel.tsx` — `doFullSync`

- Mostrar no toast o **label atual** + total ("Sincronizando Enviados — 1.240 msgs…").
- Manter o loop de até 200 iterações chamando `fullSyncFn({ data: { restart: i === 0, windowDays: 180 } })` até `r.done === true`.
- Ao fim, recarregar pastas e threads.

### 4. Endpoint público `src/routes/api/public/gmail-poll.ts`

- Quando `state.last_history_id` está ausente **ou** `full_sync_in_progress = true`, executar uma rodada de `fullSync` por owner em vez de só retornar `needsFullSync`. Isso garante que o cron continua o backfill sem depender de o usuário clicar no botão.

### Fora de escopo

- Não muda RLS, não mexe em `emails`/`email_threads`, não toca em anexos nem no compose.
- Não altera o `EmailPanel` além do toast e do parâmetro `windowDays`.
- Não muda janela depois de pronta — fica fixa em 180 dias (configurável só via parâmetro do server fn).

## Detalhe técnico

A query `q=newer_than:180d` usa a sintaxe nativa de busca do Gmail e é avaliada do lado do servidor, então a paginação volta apenas IDs dentro da janela — sem desperdiçar lotes em emails antigos. Combinada com `labelIds`, garante cobertura por pasta sem depender da ordem global de `internalDate`.
