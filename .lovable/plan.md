# Auditoria completa antes da sincronização

Verifiquei código + estado do banco + cron. Encontrei **3 problemas que precisam ser corrigidos juntos** antes de você clicar em "Iniciar mirror completo".

## Estado atual (booking@adatours.com)

| Item | Valor | OK? |
|---|---|---|
| Cron `gmail-incremental-poll` | ativo, único, aponta para `/api/public/gmail-poll` | ✅ |
| Guarda no `gmail-poll` | espera `last_full_sync_at` antes de incremental | ✅ |
| `last_full_sync_at` | `NULL` | ✅ |
| `full_sync_in_progress` | `false` | ✅ |
| `wipe_status` | `idle` | ✅ |
| `emails` / `threads` / `labels` no DB | 0 / 0 / 0 (já limpos) | ✅ |
| **`last_history_id`** | **`33256984`** (cursor antigo) | ❌ |
| **`last_incremental_sync_at`** | `2026-05-09 00:28:01` (antigo) | ❌ |

## Problemas no código que vão quebrar o ciclo

### Problema 1 — `startFullMirror` não captura o historyId atual
`src/server/gmail-mirror.server.ts:292` — o upsert que inicia o mirror não toca em `last_history_id`. Resultado: o valor antigo `33256984` permanece. Quando o mirror terminar e o incremental destravar, o Gmail responde **404 "history not found"** no primeiro tick.

### Problema 2 — `runFullSyncTick` (done=true) também não atualiza `last_history_id`
Linha 419: ao concluir, só seta `last_full_sync_at = now()`. Não refresca o cursor. Mesmo efeito do problema 1.

### Problema 3 — `runIncrementalSync` em 404 não auto-recupera
Linha 562: ao receber 404, retorna `{ needsFullSync: true }` mas **não limpa** `last_history_id` nem reagenda nada. O cron vai logar 404 silenciosamente a cada minuto até alguém intervir manualmente.

## Correções (uma única passada)

### 1. `startFullMirror` — snapshot do historyId no início

```ts
// src/server/gmail-mirror.server.ts dentro de startFullMirror, antes do upsert
const profile = (await gw(`/users/me/profile`)) as { emailAddress: string; historyId?: string };
// no upsert, adicionar:
last_history_id: profile.historyId ? Number(profile.historyId) : null,
```

Isso garante que, quando o full sync acabar, o incremental parte do "agora" do Gmail (o próprio mirror cobre o passado).

### 2. `runIncrementalSync` em 404 — limpar cursor

```ts
// linha 562 — em vez de só retornar:
if (String(e.message || "").includes("404")) {
  await supabase.from("email_sync_state").update({
    last_history_id: null, last_full_sync_at: null,
    updated_at: new Date().toISOString(),
  }).eq("owner_email", owner);
  return { added: 0, deleted: 0, needsFullSync: true };
}
```

Assim, se algum dia o cursor expirar, o sistema volta sozinho ao estado "esperando mirror completo" em vez de loopar 404.

### 3. Limpar o estado atual no banco

```sql
UPDATE email_sync_state
SET last_history_id = NULL,
    last_incremental_sync_at = NULL,
    last_full_sync_at = NULL,
    updated_at = now()
WHERE owner_email = 'booking@adatours.com';
```

A guarda continua segurando o cron porque `last_full_sync_at` permanece `NULL` até o mirror terminar.

## Fluxo esperado depois das correções

1. Você clica em **Iniciar mirror completo** → captura `historyId` atual + marca `full_sync_in_progress=true`.
2. Cron roda `runFullSyncTick` a cada minuto, label por label, mês a mês.
3. Quando esvazia a fila → `last_full_sync_at = now()`, `full_sync_in_progress = false`.
4. Próximo tick destrava o incremental, usa o `last_history_id` capturado no passo 1 → sem 404.
5. Bonus: se em algum momento futuro o cursor expirar (>7 dias parado), o sistema reseta sozinho.

## Resumo

Aplicando os 3 itens acima numa única tarefa, **sim**, fica pronto para a sincronização completa correta. Sem essas correções, vai dar 404 no instante em que o full sync terminar.
